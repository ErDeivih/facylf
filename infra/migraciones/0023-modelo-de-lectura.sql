-- 0023 · Modelo de lectura: la web lee resúmenes precalculados, no recorre hechos en cada visita
--
-- Por qué (medido el 21/10/2026, ver docs/plataforma-web/PLATAFORMA-NACIONAL.md §2):
--   · `analytics.team_edition_summary`, `analytics.player_team_season_summary`,
--     `analytics.player_career_summary` y `analytics.search_entity` existen desde la 0005 pero están a 0
--     filas: NINGÚN proceso del repositorio las escribe.
--   · Por eso cada informe y cada ficha agregan `core.appearance` y `core.match_event` (decenas de millones
--     de filas cuando estén todas las federaciones) en el momento de la petición. Es la causa de fondo de
--     que pedir un equipo o un jugador «tarde».
--
-- Qué añade esta migración (aditiva; 0001-0022 no se tocan):
--   1. `analytics.proyeccion_grupo`: cuándo se proyectó cada grupo y a partir de qué cobertura.
--   2. `analytics.proyeccion_pendiente`: los grupos cuyo `ops.coverage_checkpoint.calculado_en` cambió
--      después de la última proyección (el importador lo pone a now() en cada lote de ese grupo).
--   3. Funciones que recalculan, por grupo, los resúmenes de equipo y de jugador, y por lista de personas
--      la carrera y la búsqueda. Son idempotentes: borran lo del ámbito y lo vuelven a escribir.
--
-- Reglas que respetan (las mismas de los informes, para que la web y el PDF digan lo mismo):
--   · Minutos: idéntica regla que `scripts/lib/informe-minutos.mjs` (reglamentarios, sin añadido; NULL
--     cuando la secuencia no es interpretable; sala y playa sin minutos). `minutos_exactos` sólo tiene
--     valor si TODOS los partidos en que jugó son calculables; si no, NULL y `minutos_fiables = false`.
--     `minutos_estimados` es la suma de los calculables: una cota inferior, nunca se presenta como total.
--   · `called_up_unknown` suma convocatoria, no partido jugado, salvo que un evento propio (entra, sale o
--     gol) demuestre que participó. Una tarjeta NO demuestra participación (se puede ver en el banquillo).
--   · Un evento de técnico o de sujeto desconocido no cuenta nunca para un jugador.
--   · Los totales de equipo son la reconstrucción por resultados; la clasificación oficial sigue en
--     `core.standing_snapshot` y prevalece en pantalla.
--
-- Alternativa descartada: pg_ivm (vistas materializadas incrementales). No admite OUTER JOIN y bloquea la
-- escritura mientras mantiene la vista: el importador quedaría esperando a la web. El grupo ya es la unidad
-- de importación, así que recalcular el grupo entero tras su lote es simple, acotado y verificable.

create table if not exists analytics.proyeccion_grupo (
  phase_group_id  bigint      primary key references core.phase_group(id) on delete cascade,
  proyectado_en   timestamptz not null default now(),
  cobertura_de    timestamptz,
  metric_version  integer     not null,
  equipos         integer     not null default 0,
  jugadores       integer     not null default 0,
  duracion_ms     integer
);

comment on table analytics.proyeccion_grupo is
  'Una fila por grupo proyectado. `cobertura_de` es el `ops.coverage_checkpoint.calculado_en` que se leyó: '
  'si la cobertura cambia (nuevo lote), el grupo vuelve a estar pendiente.';

create or replace function analytics.version_metricas()
returns integer language sql immutable parallel safe as $$ select 1 $$;

comment on function analytics.version_metricas() is
  'Versión de las reglas de cálculo. Subirla deja todos los grupos pendientes de reproyectar.';

create or replace view analytics.proyeccion_pendiente as
select cc.phase_group_id, cc.calculado_en, p.proyectado_en
  from ops.coverage_checkpoint cc
  left join analytics.proyeccion_grupo p on p.phase_group_id = cc.phase_group_id
 where p.phase_group_id is null
    or p.cobertura_de is distinct from cc.calculado_en
    or p.metric_version < analytics.version_metricas();

create or replace function analytics.duracion_reglamentaria(p_modalidad text, p_categoria text)
returns integer
language sql
immutable
parallel safe
as $$
  -- Copia exacta de `duracionSql` (scripts/lib/informe-formato.mjs). Si cambia una, cambia la otra.
  select case
    when p_modalidad in ('sala', 'playa') then null::int
    when core.normaliza_nombre(p_categoria) like '%prebenjamin%' then 40
    when core.normaliza_nombre(p_categoria) like '%benjamin%' then 50
    when core.normaliza_nombre(p_categoria) like '%alevin%' then 60
    when core.normaliza_nombre(p_categoria) like '%infantil%' then 70
    when core.normaliza_nombre(p_categoria) like '%cadete%' then 80
    else 90
  end
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Proyección de un grupo: equipos y jugadores
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function analytics.proyecta_grupo(p_grupo bigint)
returns jsonb
language plpgsql
as $$
declare
  v_inicio    timestamptz := clock_timestamp();
  v_edicion   bigint;
  v_season    smallint;
  v_duracion  integer;
  v_cobertura timestamptz;
  v_fuente    bigint;
  v_version   integer := analytics.version_metricas();
  v_antes     bigint[];
  v_despues   bigint[];
  v_equipos   integer;
  v_jugadores integer;
begin
  select pg.competition_edition_id, ce.season_id,
         analytics.duracion_reglamentaria(ce.modalidad, ce.categoria)
    into v_edicion, v_season, v_duracion
    from core.phase_group pg
    join core.competition_edition ce on ce.id = pg.competition_edition_id
   where pg.id = p_grupo;
  if v_edicion is null then
    raise exception 'El grupo % no existe en core.phase_group', p_grupo;
  end if;

  select cc.calculado_en into v_cobertura from ops.coverage_checkpoint cc where cc.phase_group_id = p_grupo;
  select coalesce(max(m.data_version), 0) into v_fuente from core.match m where m.phase_group_id = p_grupo;

  -- Las personas que el grupo tenía ANTES también se devuelven: si una desaparece del grupo (lote
  -- corregido), su carrera tiene que recalcularse igualmente.
  select coalesce(array_agg(distinct s.person_id), '{}')
    into v_antes
    from analytics.player_team_season_summary s
    join core.team_entry te on te.id = s.team_entry_id
   where te.phase_group_id = p_grupo;

  -- ── Equipos ────────────────────────────────────────────────────────────────────────────────────
  delete from analytics.team_edition_summary where phase_group_id = p_grupo;

  insert into analytics.team_edition_summary (
    team_entry_id, phase_group_id, jugados, ganados, empatados, perdidos, goles_favor, goles_contra,
    puntos, jugados_casa, jugados_fuera, partidos_elegibles, partidos_cubiertos,
    metric_version, source_data_version, computed_at)
  with lados as (
    select m.id as match_id, m.home_team_entry_id as team_entry_id,
           m.goles_local as gf, m.goles_visitante as gc, true as en_casa
      from core.match m
     where m.phase_group_id = p_grupo and m.home_team_entry_id is not null
    union all
    select m.id, m.away_team_entry_id, m.goles_visitante, m.goles_local, false
      from core.match m
     where m.phase_group_id = p_grupo and m.away_team_entry_id is not null
  ),
  con_acta as (
    select distinct a.match_id, a.team_entry_id
      from core.appearance a
     where a.team_entry_id in (select id from core.team_entry where phase_group_id = p_grupo)
  )
  select te.id, p_grupo,
         count(*) filter (where l.gf is not null and l.gc is not null),
         count(*) filter (where l.gf > l.gc),
         count(*) filter (where l.gf = l.gc),
         count(*) filter (where l.gf < l.gc),
         coalesce(sum(l.gf) filter (where l.gf is not null and l.gc is not null), 0),
         coalesce(sum(l.gc) filter (where l.gf is not null and l.gc is not null), 0),
         3 * count(*) filter (where l.gf > l.gc) + count(*) filter (where l.gf = l.gc),
         count(*) filter (where l.en_casa and l.gf is not null and l.gc is not null),
         count(*) filter (where not l.en_casa and l.gf is not null and l.gc is not null),
         count(*) filter (where l.gf is not null and l.gc is not null),
         count(ca.match_id) filter (where l.gf is not null and l.gc is not null),
         v_version, v_fuente, now()
    from core.team_entry te
    left join lados l on l.team_entry_id = te.id
    left join con_acta ca on ca.match_id = l.match_id and ca.team_entry_id = te.id
   where te.phase_group_id = p_grupo
   group by te.id;
  get diagnostics v_equipos = row_count;

  -- ── Jugadores ──────────────────────────────────────────────────────────────────────────────────
  delete from analytics.player_team_season_summary s
   using core.team_entry te
   where te.id = s.team_entry_id and te.phase_group_id = p_grupo;

  insert into analytics.player_team_season_summary (
    person_id, season_id, team_entry_id, competition_edition_id,
    convocatorias, partidos_demostrados, titularidades, suplencias,
    minutos_exactos, minutos_estimados, goles, goles_penalti, propias_puerta, amarillas, rojas,
    partidos_elegibles, partidos_cubiertos, minutos_fiables, metric_version, source_data_version, computed_at)
  with ap as (
    -- Una fila por (partido, persona, equipo). Si la fuente la pone dos veces (titular y suplente a la
    -- vez, ver 0016), cuenta una convocatoria y sus minutos no son calculables.
    select a.match_id, a.person_id, a.team_entry_id,
           case when bool_or(a.condition = 'starter') then 'starter'
                when bool_or(a.condition = 'substitute') then 'substitute'
                else 'called_up_unknown' end as condicion,
           count(*) as copias
      from core.appearance a
     where a.team_entry_id in (select id from core.team_entry where phase_group_id = p_grupo)
     group by a.match_id, a.person_id, a.team_entry_id
  ),
  ev as (
    select e.match_id, e.person_id, e.team_entry_id,
           min(e.minute_base) filter (where e.event_type = 'entra')                       as entrada,
           min(e.minute_base) filter (where e.event_type in ('sale', 'tarjeta_roja'))      as salida,
           count(*) filter (where e.event_type = 'entra')                                  as entradas,
           count(*) filter (where e.event_type = 'sale')                                   as salidas,
           coalesce(bool_or(e.minute_base is null or e.minute_base < 0
                            or e.minute_base > coalesce(v_duracion, 0) + 30)
                    filter (where e.event_type in ('entra', 'sale', 'tarjeta_roja')), false) as invalido,
           count(*) filter (where e.event_type = 'gol'
                              and coalesce(e.subtipo, 'normal') <> 'propia_puerta')        as goles,
           count(*) filter (where e.event_type = 'gol' and e.subtipo = 'penalti')          as goles_penalti,
           count(*) filter (where e.event_type = 'gol' and e.subtipo = 'propia_puerta')    as propias,
           count(*) filter (where e.event_type = 'tarjeta_amarilla')                       as amarillas,
           count(*) filter (where e.event_type = 'tarjeta_roja')                           as rojas
      from core.match_event e
     where e.match_id in (select m.id from core.match m where m.phase_group_id = p_grupo)
       and e.sujeto_tipo = 'jugador'
       and e.person_id is not null
       and e.team_entry_id is not null
     group by e.match_id, e.person_id, e.team_entry_id
  ),
  claves as (
    select match_id, person_id, team_entry_id from ap
    union
    select match_id, person_id, team_entry_id from ev
     where team_entry_id in (select id from core.team_entry where phase_group_id = p_grupo)
  ),
  por_partido as (
    select k.person_id, k.team_entry_id, ap.condicion,
           (ap.condicion = 'starter'
             or coalesce(ev.entradas, 0) > 0
             or coalesce(ev.salidas, 0) > 0
             or coalesce(ev.goles, 0) + coalesce(ev.propias, 0) > 0)               as jugo,
           (ap.condicion in ('starter', 'substitute')
             or coalesce(ev.entradas, 0) > 0
             or coalesce(ev.goles, 0) + coalesce(ev.propias, 0) > 0)               as cuenta_minutos,
           case
             when v_duracion is null then null
             when ap.condicion is null or ap.condicion not in ('starter', 'substitute') then null
             when ap.condicion = 'substitute' and coalesce(ev.entradas, 0) = 0
                  and coalesce(ev.salidas, 0) = 0 then 0
             when coalesce(ev.invalido, false) or coalesce(ev.entradas, 0) > 1
                  or coalesce(ev.salidas, 0) > 1 then null
             when ap.condicion = 'starter' and coalesce(ev.entradas, 0) > 0 then null
             when ap.condicion = 'substitute' and coalesce(ev.entradas, 0) = 0 then null
             when ap.copias > 1 then null
             when ap.condicion = 'substitute' and ev.salida < ev.entrada then null
             else least(coalesce(ev.salida, v_duracion), v_duracion)
                  - case when ap.condicion = 'starter' then 0 else least(ev.entrada, v_duracion) end
           end as minutos,
           coalesce(ev.goles, 0) as goles, coalesce(ev.goles_penalti, 0) as goles_penalti,
           coalesce(ev.propias, 0) as propias, coalesce(ev.amarillas, 0) as amarillas,
           coalesce(ev.rojas, 0) as rojas
      from claves k
      left join ap on ap.match_id = k.match_id and ap.person_id = k.person_id
                  and ap.team_entry_id = k.team_entry_id
      left join ev on ev.match_id = k.match_id and ev.person_id = k.person_id
                  and ev.team_entry_id = k.team_entry_id
  )
  select pp.person_id, v_season, pp.team_entry_id, v_edicion,
         count(*) filter (where pp.condicion is not null),
         count(*) filter (where pp.jugo),
         count(*) filter (where pp.condicion = 'starter'),
         count(*) filter (where pp.condicion = 'substitute'),
         case when count(*) filter (where pp.cuenta_minutos) = 0 then null
              when bool_and(pp.minutos is not null) filter (where pp.cuenta_minutos)
                then sum(pp.minutos) filter (where pp.cuenta_minutos)
              else null end,
         sum(pp.minutos) filter (where pp.cuenta_minutos),
         sum(pp.goles), sum(pp.goles_penalti), sum(pp.propias), sum(pp.amarillas), sum(pp.rojas),
         coalesce(max(t.partidos_elegibles), 0), coalesce(max(t.partidos_cubiertos), 0),
         coalesce(count(*) filter (where pp.cuenta_minutos) > 0
                  and bool_and(pp.minutos is not null) filter (where pp.cuenta_minutos), false),
         v_version, v_fuente, now()
    from por_partido pp
    left join analytics.team_edition_summary t on t.team_entry_id = pp.team_entry_id
   group by pp.person_id, pp.team_entry_id;
  get diagnostics v_jugadores = row_count;

  select coalesce(array_agg(distinct s.person_id), '{}')
    into v_despues
    from analytics.player_team_season_summary s
    join core.team_entry te on te.id = s.team_entry_id
   where te.phase_group_id = p_grupo;

  insert into analytics.proyeccion_grupo (phase_group_id, proyectado_en, cobertura_de, metric_version,
                                          equipos, jugadores, duracion_ms)
  values (p_grupo, now(), v_cobertura, v_version, v_equipos, v_jugadores,
          (extract(epoch from clock_timestamp() - v_inicio) * 1000)::integer)
  on conflict (phase_group_id) do update set
    proyectado_en = excluded.proyectado_en, cobertura_de = excluded.cobertura_de,
    metric_version = excluded.metric_version, equipos = excluded.equipos,
    jugadores = excluded.jugadores, duracion_ms = excluded.duracion_ms;

  return jsonb_build_object(
    'grupo', p_grupo,
    'equipos', v_equipos,
    'jugadores', v_jugadores,
    'personas', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                   from unnest(v_antes || v_despues) as x));
end;
$$;

comment on function analytics.proyecta_grupo(bigint) is
  'Recalcula los resúmenes de equipo y de jugador de un grupo y devuelve las personas afectadas. '
  'Idempotente: borra lo del grupo y lo vuelve a escribir en la misma transacción.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Carrera de una lista de personas
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function analytics.proyecta_carreras(p_personas bigint[])
returns integer
language plpgsql
as $$
declare
  v_filas integer;
begin
  delete from analytics.player_career_summary where person_id = any(p_personas);

  insert into analytics.player_career_summary (
    person_id, temporadas, equipos, federaciones, convocatorias, partidos_demostrados, goles,
    primera_temporada, ultima_temporada, identidad_confirmada, metric_version, source_data_version, computed_at)
  select s.person_id,
         count(distinct s.season_id),
         count(distinct s.team_entry_id),
         count(distinct ce.federation_id),
         sum(s.convocatorias), sum(s.partidos_demostrados), sum(s.goles),
         (array_agg(se.etiqueta order by se.orden asc))[1],
         (array_agg(se.etiqueta order by se.orden desc))[1],
         not bool_or(p.identidad_nominal),
         analytics.version_metricas(), max(s.source_data_version), now()
    from analytics.player_team_season_summary s
    join core.person p on p.id = s.person_id
    join core.season se on se.id = s.season_id
    join core.competition_edition ce on ce.id = s.competition_edition_id
   where s.person_id = any(p_personas)
   group by s.person_id;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

comment on function analytics.proyecta_carreras(bigint[]) is
  'Recalcula la carrera de las personas dadas desde sus resúmenes por temporada y equipo.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Búsqueda
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- `season_from` y `season_to` guardan `core.season.orden` (cronológico), no el id.
-- `restringida` = persona menor: fuera de la búsqueda nominal salvo para los roles autorizados.

create or replace function analytics.proyecta_busqueda_personas(p_personas bigint[])
returns integer
language plpgsql
as $$
declare
  v_filas integer;
begin
  delete from analytics.search_entity where entity_type = 'persona' and entity_id = any(p_personas);

  with ultima as (
    select distinct on (s.person_id)
           s.person_id, ce.federation_id, cl.id as club_id, ts.nombre as equipo, se.etiqueta, se.orden
      from analytics.player_team_season_summary s
      join core.season se on se.id = s.season_id
      join core.competition_edition ce on ce.id = s.competition_edition_id
      join core.team_entry te on te.id = s.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
      join core.club cl on cl.id = ts.club_id
     where s.person_id = any(p_personas)
     order by s.person_id, se.orden desc, s.partidos_demostrados desc, s.team_entry_id
  ),
  rango as (
    select s.person_id, min(se.orden) as desde, max(se.orden) as hasta,
           sum(s.partidos_demostrados) as partidos
      from analytics.player_team_season_summary s
      join core.season se on se.id = s.season_id
     where s.person_id = any(p_personas)
     group by s.person_id
  ),
  nombres as (
    select p.id as person_id, p.nombre_mostrado as nombre, false as es_alias from core.person p
     where p.id = any(p_personas)
    union all
    select pn.person_id, pn.literal, true from core.person_name pn
     where pn.person_id = any(p_personas)
  )
  insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, es_alias,
                                       federation_id, season_from, season_to, provincia, club_id, contexto,
                                       popularidad, restringida, updated_at)
  select distinct on (n.person_id, btrim(core.normaliza_nombre(n.nombre)))
         'persona', n.person_id, n.nombre, btrim(core.normaliza_nombre(n.nombre)), n.es_alias,
         u.federation_id, r.desde, r.hasta, null, u.club_id,
         concat_ws(' · ', u.equipo, u.etiqueta),
         least(coalesce(r.partidos, 0), 1000)::integer,
         p.es_menor, now()
    from nombres n
    join core.person p on p.id = n.person_id
    join ultima u on u.person_id = n.person_id
    join rango r on r.person_id = n.person_id
   where btrim(core.normaliza_nombre(n.nombre)) <> ''
   order by n.person_id, btrim(core.normaliza_nombre(n.nombre)), n.es_alias;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

create or replace function analytics.proyecta_busqueda_grupo(p_grupo bigint)
returns integer
language plpgsql
as $$
declare
  v_clubes bigint[];
  v_equipos bigint[];
  v_edicion bigint;
  v_filas integer := 0;
  v_n integer;
begin
  select coalesce(array_agg(distinct ts.club_id), '{}'), coalesce(array_agg(distinct ts.id), '{}')
    into v_clubes, v_equipos
    from core.team_entry te
    join core.team_season ts on ts.id = te.team_season_id
   where te.phase_group_id = p_grupo;
  select competition_edition_id into v_edicion from core.phase_group where id = p_grupo;

  -- Clubes: su contexto se calcula sobre TODA su historia, no sólo sobre este grupo.
  delete from analytics.search_entity where entity_type = 'club' and entity_id = any(v_clubes);
  insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, es_alias,
                                       federation_id, season_from, season_to, provincia, club_id, contexto,
                                       popularidad, restringida, updated_at)
  select 'club', cl.id, cl.nombre_canonico, btrim(cl.nombre_norm), false, cl.federation_id,
         min(se.orden), max(se.orden), cl.provincia, cl.id,
         concat_ws(' · ', nullif(concat_ws(', ', cl.municipio, cl.provincia), ''), f.nombre),
         least(count(te.id), 1000)::integer, false, now()
    from core.club cl
    join core.federation f on f.id = cl.federation_id
    left join core.team_season ts on ts.club_id = cl.id
    left join core.season se on se.id = ts.season_id
    left join core.team_entry te on te.team_season_id = ts.id
   where cl.id = any(v_clubes) and btrim(cl.nombre_norm) <> ''
   group by cl.id, f.nombre;
  get diagnostics v_n = row_count; v_filas := v_filas + v_n;

  -- Equipos de temporada (club + temporada + nombre): «Pizarrales juvenil 2025-26».
  delete from analytics.search_entity where entity_type = 'equipo' and entity_id = any(v_equipos);
  insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, es_alias,
                                       federation_id, season_from, season_to, provincia, club_id, contexto,
                                       popularidad, restringida, updated_at)
  select distinct on (ts.id)
         'equipo', ts.id, ts.nombre, btrim(ts.nombre_norm), false, cl.federation_id,
         se.orden, se.orden, cl.provincia, cl.id,
         concat_ws(' · ', nullif(ts.categoria, 'desconocida'), ce.nombre_publicado, se.etiqueta),
         0, false, now()
    from core.team_season ts
    join core.club cl on cl.id = ts.club_id
    join core.season se on se.id = ts.season_id
    join core.team_entry te on te.team_season_id = ts.id
    join core.phase_group pg on pg.id = te.phase_group_id
    join core.competition_edition ce on ce.id = pg.competition_edition_id
   where ts.id = any(v_equipos) and btrim(ts.nombre_norm) <> ''
   order by ts.id, (ce.ambito = 'copa'), te.id;
  get diagnostics v_n = row_count; v_filas := v_filas + v_n;

  -- La edición de competición.
  delete from analytics.search_entity where entity_type = 'competicion' and entity_id = v_edicion;
  insert into analytics.search_entity (entity_type, entity_id, display_name, normalized_name, es_alias,
                                       federation_id, season_from, season_to, provincia, club_id, contexto,
                                       popularidad, restringida, updated_at)
  select 'competicion', ce.id, ce.nombre_publicado, btrim(core.normaliza_nombre(ce.nombre_publicado)), false,
         ce.federation_id, se.orden, se.orden, ce.provincia, null,
         concat_ws(' · ', f.nombre, se.etiqueta), 0, false, now()
    from core.competition_edition ce
    join core.season se on se.id = ce.season_id
    join core.federation f on f.id = ce.federation_id
   where ce.id = v_edicion and btrim(core.normaliza_nombre(ce.nombre_publicado)) <> '';
  get diagnostics v_n = row_count; v_filas := v_filas + v_n;

  return v_filas;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Índices que piden las páginas nuevas (fichas de club y de jugador)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
create index if not exists player_summary_person_idx
  on analytics.player_team_season_summary (person_id, season_id desc, team_entry_id);
create index if not exists search_tipo_popularidad_idx
  on analytics.search_entity (entity_type, popularidad desc)
  where not restringida;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- Permisos: la web lee; el publicador (el mismo rol que importa) proyecta.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
grant select on analytics.proyeccion_grupo, analytics.proyeccion_pendiente to facylf_lector;
grant select, insert, update, delete on analytics.proyeccion_grupo to facylf_publicador;
grant select on analytics.proyeccion_pendiente to facylf_publicador;
grant execute on function analytics.version_metricas(),
                          analytics.duracion_reglamentaria(text, text)
  to facylf_lector, facylf_publicador;
grant execute on function analytics.proyecta_grupo(bigint),
                          analytics.proyecta_carreras(bigint[]),
                          analytics.proyecta_busqueda_personas(bigint[]),
                          analytics.proyecta_busqueda_grupo(bigint)
  to facylf_publicador;
