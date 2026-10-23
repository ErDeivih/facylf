-- 0029 · Minutos (dato principal), disciplina y sanciones, desglose por equipos, posiciones y árbitros
--
-- Por qué (David, 21/10/2026):
--   · «Los minutos jugados es casi lo más importante que tenemos de cada jugador». Hasta ahora un jugador con
--     cambios volantes (fútbol base: sale y vuelve a entrar) quedaba con minutos «no calculables», y una
--     segunda amarilla escrita como dos amarillas sueltas no cortaba sus minutos.
--   · «Si está en un B, puede jugar en un A… si es cadete, puede jugar en juvenil… puede irse a otro club a
--     mitad de temporada». Hace falta la suma y el desglose por equipo, con el papel de cada equipo.
--   · «La doble amarilla… una amarilla y luego otra amarilla… lo tenemos que contabilizar como doble
--     amarilla». Y «los partidos que después se ha perdido el jugador» por la expulsión.
--   · Árbitros: estadísticas por árbitro (tarjetas, penaltis, resultados) y su trayectoria.
--   · Posiciones: la FFCV (Valencia) publica la demarcación de ~85 % de los jugadores desde 2025-26, la RFFM
--     (Madrid) de ~10 %, la FCF (Cataluña) sólo el capitán, y el resto sólo el portero. Se guardan cuando
--     existen; NUNCA se inventan (el dorsal sólo acierta la línea en el 64 % de los titulares, medido sobre
--     238 actas de Valencia: no se usa para deducir posiciones).
--
-- Qué añade (aditiva: 0001-0028 no se tocan; las funciones se REEMPLAZAN con `create or replace`):
--   1. Posiciones, capitán y sistema de juego: `core.appearance_detalle`, `core.match_esquema`.
--   2. `analytics.minutos_partido()`: minutos de un jugador en un partido con cualquier secuencia de
--      entradas y salidas, expulsión y segunda amarilla. Pura y probada.
--   3. `analytics.proyecta_grupo()` (versión 2): usa 2., deduce la doble amarilla, cuenta expulsiones por
--      partido (no por tarjeta) y amplía la duración en partidos con prórroga.
--   4. Sanciones inferidas: `analytics.sancion_inferida` + `analytics.proyecta_sanciones_edicion()`.
--   5. Temporada del jugador con desglose por equipo: `analytics.jugador_temporada`,
--      `analytics.minutos_por_equipo` y `analytics.proyecta_temporadas()`.
--   6. Escalón nacional orientativo para comparar entre federaciones: `analytics.escalon()`.
--   7. Árbitros: `analytics.arbitro_persona`, `analytics.arbitro_temporada`, `analytics.recalcula_arbitros()`.
--   8. Versión de métricas 2 y `proyeccion_pendiente` que la respeta (antes no la miraba).

-- ── 1. Posiciones, capitán y sistema ─────────────────────────────────────────────────────────────────
create table if not exists core.appearance_detalle (
  appearance_id    bigint  primary key references core.appearance(id) on delete cascade,
  posicion         text    check (posicion in (
                     'POR','LD','LI','DFC','CAD','CAI','D','MCD','MC','MCO','MD','MI','M','ED','EI','MP','SD','DC','A',
                     'CI','AL','PV','U')),          -- las cuatro últimas, fútbol sala: cierre, ala, pívot, universal
  posicion_literal text,                         -- tal cual viene («Lateral derecho», «Medio centro»…)
  capitan          boolean
);
comment on table core.appearance_detalle is
  'Datos de la fila del jugador que sólo dan algunas federaciones. NULL = la fuente no lo dice (nunca «no»). '
  'Lo escribe el importador desde la cola (participaciones.posicion/capitan) y, para lo ya importado, '
  'scripts/rellena-posiciones.mjs leyendo los JSON archivados (sin red).';

create table if not exists core.match_esquema (
  match_id bigint not null references core.match(id) on delete cascade,
  lado     text   not null check (lado in ('local','visitante')),
  esquema  text   not null check (esquema ~ '^1(-[1-6]){2,5}$'),   -- '1-4-3-3'
  primary key (match_id, lado)
);

create or replace function core.linea_de_posicion(p text)
returns text language sql immutable parallel safe as $$
  select case
    when p is null then null
    when p = 'POR' then 'POR'
    when p in ('LD','LI','DFC','CAD','CAI','D','CI') then 'DEF'
    when p in ('MCD','MC','MCO','MD','MI','M','MP','AL') then 'MED'
    when p in ('ED','EI','SD','DC','A','PV') then 'DEL'
    else null end
$$;

-- Normaliza lo que publica cada federación a la lista cerrada de arriba. Devuelve NULL si no lo reconoce
-- (y el literal se guarda igual en posicion_literal).
create or replace function core.posicion_normalizada(p_abrev text, p_literal text)
returns text language sql immutable parallel safe as $$
  with x as (select upper(btrim(coalesce(p_abrev, ''))) a, core.normaliza_nombre(coalesce(p_literal, '')) l)
  select case
    when a in ('POR','LD','LI','DFC','CAD','CAI','D','MCD','MC','MCO','MD','MI','M','ED','EI','MP','SD','DC','A','CI','AL','PV','U') then a
    when a = 'P' then 'POR'
    when a = 'C' and l like 'cierre%' then 'CI'
    when a = 'C' then 'DFC'                -- RFFM usa «C» para «Defensa central»
    when l like 'porter%' then 'POR'
    when l like 'lateral derech%' then 'LD'
    when l like 'lateral izquier%' then 'LI'
    when l like 'central%' or l like 'defensa central%' then 'DFC'
    when l like 'defensa%' then 'D'
    when l like 'medio centro defens%' or l like 'pivote%' then 'MCD'
    when l like 'medio centro ofens%' or l like 'mediapunta%' then 'MCO'
    when l like 'medio centro%' or l like 'mediocentro%' then 'MC'
    when l like 'medio derech%' or l like 'interior derech%' then 'MD'
    when l like 'medio izquier%' or l like 'interior izquier%' then 'MI'
    when l like 'centrocampista%' or l like 'medio%' then 'M'
    when l like 'extremo derech%' then 'ED'
    when l like 'extremo izquier%' then 'EI'
    when l like 'delantero centro%' then 'DC'
    when l like 'delanter%' or l like 'ataque%' then 'A'
    when l like 'ala%' then 'AL'
    when l like 'pivot%' then 'PV'
    else null end
  from x
$$;

-- ── 2. Minutos de un partido ─────────────────────────────────────────────────────────────────────────
-- p_eventos: [{"t":"entra"|"sale"|"roja"|"am2","m":minuto,"o":orden_en_acta}]. «am2» es la segunda amarilla
-- deducida (dos amarillas sueltas sin roja). Reglas:
--   · Titular empieza dentro en el minuto 0; suplente fuera. Suplente sin eventos = 0 minutos.
--   · Se recorren en orden (minuto, orden del acta). «entra» estando dentro, «sale» estando fuera, o volver
--     a entrar tras una expulsión → secuencia imposible → NULL (no se inventa).
--   · Cambios volantes (sale y vuelve a entrar): se suman los tramos. Es lo normal en fútbol 7/8.
--   · Expulsión (roja o am2) estando dentro cierra el tramo; estando fuera (banquillo) no cambia nada.
--   · Minuto NULL o fuera de [0, duración + 30] → NULL. Minuto en el añadido (91, 93) cuenta como el final.
create or replace function analytics.minutos_partido(p_condicion text, p_eventos jsonb, p_duracion integer)
returns integer language plpgsql immutable parallel safe as $$
declare
  e jsonb; dentro boolean; desde integer := 0; total integer := 0; m integer; expulsado boolean := false;
begin
  if p_duracion is null or p_condicion is null or p_condicion not in ('starter', 'substitute') then
    return null;
  end if;
  dentro := (p_condicion = 'starter');
  for e in
    select x from jsonb_array_elements(coalesce(p_eventos, '[]'::jsonb)) x
     order by (x->>'m')::integer nulls first, coalesce((x->>'o')::integer, 0)
  loop
    if e->>'m' is null then return null; end if;
    m := (e->>'m')::integer;
    if m < 0 or m > p_duracion + 30 then return null; end if;
    m := least(m, p_duracion);
    case e->>'t'
      when 'entra' then
        if dentro or expulsado then return null; end if;
        dentro := true; desde := m;
      when 'sale' then
        if not dentro then return null; end if;
        total := total + (m - desde); dentro := false;
      when 'roja', 'am2' then
        if dentro then total := total + (m - desde); dentro := false; end if;
        expulsado := true;
      else
        null;
    end case;
  end loop;
  if dentro then total := total + (p_duracion - desde); end if;
  return greatest(0, least(total, p_duracion));
end $$;

comment on function analytics.minutos_partido(text, jsonb, integer) is
  'Minutos de un jugador en un partido. Misma regla en scripts/lib/informe-minutos.mjs (si cambia una, cambia '
  'la otra). Probada en docs/plataforma-web/PRUEBAS-0029.md.';

-- Prórroga: si un partido de copa o de fase tiene eventos claramente después del final, dura más.
create or replace function analytics.duracion_con_prorroga(p_duracion integer, p_tipo_grupo text, p_max_minuto integer)
returns integer language sql immutable parallel safe as $$
  select case
    when p_duracion is null then null
    when p_tipo_grupo in ('copa', 'ascenso', 'fase') and coalesce(p_max_minuto, 0) > p_duracion + 10
      then p_duracion + case when p_duracion >= 90 then 30 when p_duracion >= 70 then 20 else 10 end
    else p_duracion end
$$;

-- ── 3. Resumen por jugador y equipo: columnas nuevas ─────────────────────────────────────────────────
alter table analytics.player_team_season_summary
  add column if not exists rojas_directas     smallint not null default 0,
  add column if not exists dobles_amarillas   smallint not null default 0,
  add column if not exists dobles_deducidas   smallint not null default 0,
  add column if not exists partidos_sancion   smallint,
  add column if not exists minutos_posibles   integer,
  add column if not exists primera_fecha      date,
  add column if not exists ultima_fecha       date,
  add column if not exists veces_portero      smallint not null default 0,
  add column if not exists veces_capitan      smallint not null default 0,
  add column if not exists posicion_habitual  text;

comment on column analytics.player_team_season_summary.rojas is
  'Desde la versión 2 de métricas: EXPULSIONES (partidos en que fue expulsado), no tarjetas rojas sueltas. '
  'Una doble amarilla escrita como «amarilla + doble amarilla + roja» cuenta una vez.';
comment on column analytics.player_team_season_summary.minutos_posibles is
  'Partidos del equipo con acta × duración reglamentaria. % de minutos = minutos_estimados / minutos_posibles.';

create or replace function analytics.version_metricas()
returns integer language sql immutable parallel safe as $$ select 2 $$;

create or replace view analytics.proyeccion_pendiente as
select cc.phase_group_id, cc.calculado_en, p.proyectado_en
  from ops.coverage_checkpoint cc
  left join analytics.proyeccion_grupo p on p.phase_group_id = cc.phase_group_id
 where p.phase_group_id is null
    or p.cobertura_de is distinct from cc.calculado_en
    or p.metric_version < analytics.version_metricas();

-- ── 3b. proyecta_grupo, versión 2 ────────────────────────────────────────────────────────────────────
create or replace function analytics.proyecta_grupo(p_grupo bigint)
returns jsonb
language plpgsql
as $$
declare
  v_inicio    timestamptz := clock_timestamp();
  v_edicion   bigint;
  v_season    smallint;
  v_duracion  integer;
  v_tipo      text;
  v_cobertura timestamptz;
  v_fuente    bigint;
  v_version   integer := analytics.version_metricas();
  v_antes     bigint[];
  v_despues   bigint[];
  v_equipos   integer;
  v_jugadores integer;
begin
  select pg.competition_edition_id, ce.season_id, pg.tipo,
         analytics.duracion_reglamentaria(ce.modalidad, ce.categoria)
    into v_edicion, v_season, v_tipo, v_duracion
    from core.phase_group pg
    join core.competition_edition ce on ce.id = pg.competition_edition_id
   where pg.id = p_grupo;
  if v_edicion is null then
    raise exception 'El grupo % no existe en core.phase_group', p_grupo;
  end if;

  select cc.calculado_en into v_cobertura from ops.coverage_checkpoint cc where cc.phase_group_id = p_grupo;
  select coalesce(max(m.data_version), 0) into v_fuente from core.match m where m.phase_group_id = p_grupo;

  select coalesce(array_agg(distinct s.person_id), '{}')
    into v_antes
    from analytics.player_team_season_summary s
    join core.team_entry te on te.id = s.team_entry_id
   where te.phase_group_id = p_grupo;

  -- ── Equipos (igual que la versión 1) ──
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
       and m.official_status <> 'cancelled'
    union all
    select m.id, m.away_team_entry_id, m.goles_visitante, m.goles_local, false
      from core.match m
     where m.phase_group_id = p_grupo and m.away_team_entry_id is not null
       and m.official_status <> 'cancelled'
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

  -- ── Jugadores ──
  delete from analytics.player_team_season_summary s
   using core.team_entry te
   where te.id = s.team_entry_id and te.phase_group_id = p_grupo;

  insert into analytics.player_team_season_summary (
    person_id, season_id, team_entry_id, competition_edition_id,
    convocatorias, partidos_demostrados, titularidades, suplencias,
    minutos_exactos, minutos_estimados, goles, goles_penalti, propias_puerta, amarillas, rojas,
    rojas_directas, dobles_amarillas, dobles_deducidas, minutos_posibles, primera_fecha, ultima_fecha,
    veces_portero, veces_capitan, posicion_habitual,
    partidos_elegibles, partidos_cubiertos, minutos_fiables, metric_version, source_data_version, computed_at)
  with partidos as (
    select m.id as match_id, coalesce(m.played_at::date, m.fecha_prevista) as fecha, m.official_status
      from core.match m where m.phase_group_id = p_grupo
  ),
  ap as (
    select a.match_id, a.person_id, a.team_entry_id,
           case when bool_or(a.condition = 'starter') then 'starter'
                when bool_or(a.condition = 'substitute') then 'substitute'
                else 'called_up_unknown' end as condicion,
           count(*) as copias,
           bool_or(a.portero) as portero,
           bool_or(d.capitan) as capitan,
           max(d.posicion) as posicion
      from core.appearance a
      left join core.appearance_detalle d on d.appearance_id = a.id
     where a.team_entry_id in (select id from core.team_entry where phase_group_id = p_grupo)
     group by a.match_id, a.person_id, a.team_entry_id
  ),
  evs as (
    select e.*,
           row_number() over (partition by e.match_id, e.person_id, e.team_entry_id, e.event_type
                              order by e.minute_base nulls last, e.source_order) as n_tipo
      from core.match_event e
     where e.match_id in (select match_id from partidos)
       and e.sujeto_tipo = 'jugador' and e.person_id is not null and e.team_entry_id is not null
  ),
  maxmin as (
    select match_id, max(minute_base) as maximo from core.match_event
     where match_id in (select match_id from partidos) group by match_id
  ),
  ev as (
    select e.match_id, e.person_id, e.team_entry_id,
           jsonb_agg(jsonb_build_object(
                       't', case e.event_type when 'entra' then 'entra' when 'sale' then 'sale' else 'roja' end,
                       'm', e.minute_base, 'o', e.source_order))
             filter (where e.event_type in ('entra', 'sale', 'tarjeta_roja'))                   as eventos,
           count(*) filter (where e.event_type = 'entra')                                     as entradas,
           count(*) filter (where e.event_type = 'sale')                                      as salidas,
           count(*) filter (where e.event_type = 'gol' and coalesce(e.subtipo, 'normal') <> 'propia_puerta') as goles,
           count(*) filter (where e.event_type = 'gol' and e.subtipo = 'penalti')             as goles_penalti,
           count(*) filter (where e.event_type = 'gol' and e.subtipo = 'propia_puerta')       as propias,
           count(*) filter (where e.event_type = 'tarjeta_amarilla')                          as amarillas,
           count(distinct e.minute_base) filter (where e.event_type = 'tarjeta_amarilla')     as amarillas_minutos,
           bool_or(e.event_type = 'tarjeta_roja' and e.subtipo = 'doble_amarilla')            as doble,
           bool_or(e.event_type = 'tarjeta_roja' and coalesce(e.subtipo, 'normal') <> 'doble_amarilla') as directa,
           min(e.minute_base) filter (where e.event_type = 'tarjeta_amarilla' and e.n_tipo = 2) as minuto_am2
      from evs e
     group by e.match_id, e.person_id, e.team_entry_id
  ),
  claves as (
    select match_id, person_id, team_entry_id from ap
    union
    select match_id, person_id, team_entry_id from ev
     where team_entry_id in (select id from core.team_entry where phase_group_id = p_grupo)
  ),
  por_partido as (
    select k.person_id, k.team_entry_id, k.match_id, p.fecha, ap.condicion, ap.portero, ap.capitan, ap.posicion,
           -- Doble amarilla deducida: dos amarillas en minutos distintos y ninguna roja. Dos amarillas en el
           -- MISMO minuto se tratan como copia duplicada del acta (se avisa en ops, ver 0030), no como expulsión.
           (coalesce(ev.amarillas, 0) >= 2 and coalesce(ev.amarillas_minutos, 0) >= 2
              and not coalesce(ev.doble, false) and not coalesce(ev.directa, false))          as deducida,
           (ap.condicion = 'starter' or coalesce(ev.entradas, 0) > 0 or coalesce(ev.salidas, 0) > 0
              or coalesce(ev.goles, 0) + coalesce(ev.propias, 0) > 0)                         as jugo,
           (ap.condicion in ('starter', 'substitute') or coalesce(ev.entradas, 0) > 0
              or coalesce(ev.goles, 0) + coalesce(ev.propias, 0) > 0)                         as cuenta_minutos,
           ev.eventos, ev.minuto_am2, ap.copias,
           analytics.duracion_con_prorroga(v_duracion, v_tipo, mm.maximo) as duracion,
           coalesce(ev.goles, 0) as goles, coalesce(ev.goles_penalti, 0) as goles_penalti,
           coalesce(ev.propias, 0) as propias, coalesce(ev.amarillas, 0) as amarillas,
           coalesce(ev.doble, false) as doble, coalesce(ev.directa, false) as directa
      from claves k
      join partidos p on p.match_id = k.match_id
      left join ap on ap.match_id = k.match_id and ap.person_id = k.person_id and ap.team_entry_id = k.team_entry_id
      left join ev on ev.match_id = k.match_id and ev.person_id = k.person_id and ev.team_entry_id = k.team_entry_id
      left join maxmin mm on mm.match_id = k.match_id
     where p.official_status not in ('cancelled', 'administrative')
  ),
  con_minutos as (
    select pp.*,
           case
             when pp.copias > 1 then null
             else analytics.minutos_partido(
                    pp.condicion,
                    coalesce(pp.eventos, '[]'::jsonb)
                      || case when pp.deducida
                              then jsonb_build_array(jsonb_build_object('t', 'am2', 'm', pp.minuto_am2, 'o', 32000))
                              else '[]'::jsonb end,
                    pp.duracion)
           end as minutos
      from por_partido pp
  )
  select c.person_id, v_season, c.team_entry_id, v_edicion,
         count(*) filter (where c.condicion is not null),
         count(*) filter (where c.jugo),
         count(*) filter (where c.condicion = 'starter'),
         count(*) filter (where c.condicion = 'substitute'),
         case when count(*) filter (where c.cuenta_minutos) = 0 then null
              when bool_and(c.minutos is not null) filter (where c.cuenta_minutos)
                then sum(c.minutos) filter (where c.cuenta_minutos)
              else null end,
         sum(c.minutos) filter (where c.cuenta_minutos),
         sum(c.goles), sum(c.goles_penalti), sum(c.propias),
         -- Amarillas: las que se ven. En la doble deducida son 2; en la explícita la fuente ya pone 1 + doble.
         sum(c.amarillas),
         count(*) filter (where c.doble or c.directa or c.deducida),
         count(*) filter (where c.directa and not c.doble),
         count(*) filter (where c.doble or c.deducida),
         count(*) filter (where c.deducida),
         max(t.partidos_cubiertos) * v_duracion,
         min(c.fecha) filter (where c.jugo), max(c.fecha) filter (where c.jugo),
         count(*) filter (where c.portero and c.jugo),
         count(*) filter (where c.capitan and c.jugo),
         mode() within group (order by c.posicion) filter (where c.posicion is not null and c.condicion = 'starter'),
         coalesce(max(t.partidos_elegibles), 0), coalesce(max(t.partidos_cubiertos), 0),
         coalesce(count(*) filter (where c.cuenta_minutos) > 0
                  and bool_and(c.minutos is not null) filter (where c.cuenta_minutos), false),
         v_version, v_fuente, now()
    from con_minutos c
    left join analytics.team_edition_summary t on t.team_entry_id = c.team_entry_id
   group by c.person_id, c.team_entry_id;
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
    'edicion', v_edicion,
    'equipos', v_equipos,
    'jugadores', v_jugadores,
    'personas', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                   from unnest(v_antes || v_despues) as x));
end;
$$;

-- ── 4. Sanciones inferidas ───────────────────────────────────────────────────────────────────────────
-- No tenemos las resoluciones del comité de competición. Lo que SÍ se ve: tras una expulsión (o al llegar
-- a N amarillas), en cuántos partidos siguientes de SU equipo en ESA competición no aparece en el acta.
-- Se presenta como «partidos sin jugar tras la expulsión», nunca como «sanción oficial».
create table if not exists analytics.parametro_sancion (
  federation_id   smallint primary key references core.federation(id),  -- fila con id NULL no se admite: ver por_defecto
  ciclo_amarillas smallint check (ciclo_amarillas between 2 and 10),      -- NULL = no se infiere ciclo
  tope_partidos   smallint not null default 8 check (tope_partidos between 1 and 30)
);
comment on table analytics.parametro_sancion is
  'Por federación. Sin fila: ciclo de 5 amarillas y tope de 8 partidos (reglamento general RFEF y la mayoría '
  'de territoriales). Se ajusta cuando se lea cada reglamento (ver PLATAFORMA-NACIONAL.md §3.8).';

create table if not exists analytics.sancion_inferida (
  person_id              bigint   not null references core.person(id) on delete cascade,
  match_id               bigint   not null references core.match(id) on delete cascade,
  motivo                 text     not null check (motivo in ('roja_directa', 'doble_amarilla', 'doble_amarilla_deducida', 'ciclo_amarillas')),
  team_entry_id          bigint   not null references core.team_entry(id) on delete cascade,
  team_season_id         bigint   not null,
  competition_edition_id bigint   not null,
  season_id              smallint not null,
  fecha                  date,
  minuto                 smallint,
  partidos_perdidos      smallint not null default 0,
  cierre                 text     not null check (cierre in ('reaparece', 'sin_acta', 'fin_temporada', 'tope')),
  jugo_con_otro_equipo   smallint not null default 0,   -- partidos con OTRO equipo mientras no estaba en el suyo
  primary key (person_id, match_id, motivo)
);
create index if not exists sancion_edicion_idx on analytics.sancion_inferida (competition_edition_id, partidos_perdidos desc);

create or replace function analytics.proyecta_sanciones_edicion(p_edicion bigint)
returns integer language plpgsql as $$
declare v integer; v_ciclo smallint; v_tope smallint;
begin
  select coalesce(ps.ciclo_amarillas, case when ps.federation_id is null then 5 end),
         coalesce(ps.tope_partidos, 8)
    into v_ciclo, v_tope
    from core.competition_edition ce
    left join analytics.parametro_sancion ps on ps.federation_id = ce.federation_id
   where ce.id = p_edicion;

  delete from analytics.sancion_inferida where competition_edition_id = p_edicion;

  insert into analytics.sancion_inferida (person_id, match_id, motivo, team_entry_id, team_season_id,
    competition_edition_id, season_id, fecha, minuto, partidos_perdidos, cierre, jugo_con_otro_equipo)
  with partidos as (       -- los partidos de la edición, con su fecha y orden
    select m.id as match_id, coalesce(m.played_at::date, m.fecha_prevista) as fecha, md.numero,
           m.official_status, m.home_team_entry_id, m.away_team_entry_id
      from core.match m
      join core.phase_group pg on pg.id = m.phase_group_id
      left join core.matchday md on md.id = m.matchday_id
     where pg.competition_edition_id = p_edicion
  ),
  equipo_partido as (      -- cada partido visto desde cada equipo-temporada, y si hay acta de ese equipo
    select p.match_id, p.fecha, p.numero, p.official_status, te.id as team_entry_id, te.team_season_id,
           exists (select 1 from core.appearance a where a.match_id = p.match_id and a.team_entry_id = te.id) as con_acta
      from partidos p
      join core.team_entry te on te.id in (p.home_team_entry_id, p.away_team_entry_id)
  ),
  tarjetas as (
    select e.match_id, e.person_id, e.team_entry_id,
           count(*) filter (where e.event_type = 'tarjeta_amarilla') as am,
           count(distinct e.minute_base) filter (where e.event_type = 'tarjeta_amarilla') as am_min,
           bool_or(e.event_type = 'tarjeta_roja' and e.subtipo = 'doble_amarilla') as doble,
           bool_or(e.event_type = 'tarjeta_roja' and coalesce(e.subtipo, 'normal') <> 'doble_amarilla') as directa,
           min(e.minute_base) filter (where e.event_type = 'tarjeta_roja') as min_roja,
           (array_agg(e.minute_base order by e.minute_base nulls last, e.source_order)
              filter (where e.event_type = 'tarjeta_amarilla'))[2] as min_am2
      from core.match_event e
     where e.match_id in (select match_id from partidos)
       and e.sujeto_tipo = 'jugador' and e.person_id is not null and e.team_entry_id is not null
       and e.event_type in ('tarjeta_amarilla', 'tarjeta_roja')
     group by e.match_id, e.person_id, e.team_entry_id
  ),
  expulsiones as (
    select t.person_id, t.match_id, t.team_entry_id,
           case when t.doble then 'doble_amarilla' when t.directa then 'roja_directa'
                else 'doble_amarilla_deducida' end as motivo,
           case when t.doble or t.directa then t.min_roja else t.min_am2 end as minuto
      from tarjetas t
     where t.doble or t.directa or (t.am >= 2 and t.am_min >= 2)
  ),
  -- Ciclo de amarillas: en el partido en que el acumulado de amarillas (sin contar las de un partido con
  -- expulsión) pasa por un múltiplo del ciclo.
  amarillas_ordenadas as (
    select t.person_id, t.match_id, t.team_entry_id, ep.fecha,
           sum(t.am) over (partition by t.person_id, ep.team_season_id order by ep.fecha, t.match_id) as acumuladas,
           t.am
      from tarjetas t
      join equipo_partido ep on ep.match_id = t.match_id and ep.team_entry_id = t.team_entry_id
     where t.am > 0 and not (t.doble or t.directa or (t.am >= 2 and t.am_min >= 2))
  ),
  ciclos as (
    select person_id, match_id, team_entry_id, 'ciclo_amarillas'::text as motivo, null::smallint as minuto
      from amarillas_ordenadas
     where v_ciclo is not null
       and floor(acumuladas / v_ciclo) > floor((acumuladas - am) / v_ciclo)
  ),
  origen as (
    select x.*, ep.fecha, ep.team_season_id
      from (select person_id, match_id, team_entry_id, motivo, minuto from expulsiones
            union all select * from ciclos) x
      join equipo_partido ep on ep.match_id = x.match_id and ep.team_entry_id = x.team_entry_id
  ),
  siguientes as (
    select o.person_id, o.match_id, o.motivo, ep.match_id as sig_id, ep.fecha as sig_fecha, ep.con_acta,
           exists (select 1 from core.appearance a
                    where a.match_id = ep.match_id and a.person_id = o.person_id) as aparece,
           row_number() over (partition by o.person_id, o.match_id, o.motivo order by ep.fecha, ep.numero, ep.match_id) as k
      from origen o
      join equipo_partido ep on ep.team_season_id = o.team_season_id
                            and (ep.fecha, ep.match_id) > (o.fecha, o.match_id)
                            and ep.official_status = 'played'
  ),
  corte as (
    select person_id, match_id, motivo,
           min(k) filter (where aparece or not con_acta) as k_corte,
           count(*) as quedan
      from siguientes group by person_id, match_id, motivo
  ),
  resultado as (
    select o.*, c.k_corte, c.quedan,
           least(coalesce(c.k_corte - 1, c.quedan, 0), v_tope) as perdidos,
           case
             when c.quedan is null then 'fin_temporada'
             when c.k_corte is null and c.quedan > v_tope then 'tope'
             when c.k_corte is null then 'fin_temporada'
             when c.k_corte - 1 > v_tope then 'tope'
             when (select s.aparece from siguientes s where s.person_id = o.person_id and s.match_id = o.match_id
                     and s.motivo = o.motivo and s.k = c.k_corte) then 'reaparece'
             else 'sin_acta' end as cierre,
           (select s.sig_fecha from siguientes s where s.person_id = o.person_id and s.match_id = o.match_id
              and s.motivo = o.motivo and s.k = c.k_corte) as fecha_corte
      from origen o
      left join corte c on c.person_id = o.person_id and c.match_id = o.match_id and c.motivo = o.motivo
  )
  select r.person_id, r.match_id, r.motivo, r.team_entry_id, r.team_season_id, p_edicion, ce.season_id,
         r.fecha, r.minuto, r.perdidos, r.cierre,
         (select count(distinct a.match_id)
            from core.appearance a
            join core.team_entry te2 on te2.id = a.team_entry_id
            join core.match m2 on m2.id = a.match_id
           where a.person_id = r.person_id and te2.team_season_id <> r.team_season_id
             and coalesce(m2.played_at::date, m2.fecha_prevista) > r.fecha
             and coalesce(m2.played_at::date, m2.fecha_prevista) < coalesce(r.fecha_corte, r.fecha + 60)
             and r.perdidos > 0)
    from resultado r
    join core.competition_edition ce on ce.id = p_edicion;
  get diagnostics v = row_count;

  -- Al resumen de cada equipo: partidos sin jugar por sanción (sólo las que terminan con dato).
  update analytics.player_team_season_summary s
     set partidos_sancion = x.n
    from (select person_id, team_entry_id, sum(partidos_perdidos)::smallint n
            from analytics.sancion_inferida where competition_edition_id = p_edicion
           group by person_id, team_entry_id) x
   where s.person_id = x.person_id and s.team_entry_id = x.team_entry_id;
  return v;
end $$;

comment on function analytics.proyecta_sanciones_edicion(bigint) is
  'Rehace las sanciones inferidas de una edición entera (las fases de una misma competición encadenan '
  'la sanción). El proyector la llama tras proyectar cualquier grupo de la edición.';

-- ── 5. Escalón nacional orientativo ─────────────────────────────────────────────────────────────────
-- 1 = lo más alto que hay en los datos para esa categoría. Sirve para ordenar y para el ojeo entre
-- federaciones; NO es una equivalencia oficial (un «Preferente» de Madrid no es igual a uno de Soria).
create or replace function analytics.escalon(p_categoria text, p_division text, p_nivel smallint)
returns smallint language sql immutable parallel safe as $$
  select case
    when p_categoria = 'juvenil' then case p_division
        when 'division-honor' then 1 when 'liga-nacional' then 2
        when 'division-honor-regional' then 3 when 'superliga' then 3 when 'preferente' then 3 when 'autonomica' then 3
        when 'primera' then 4 when 'segunda' then 5 when 'tercera' then 6 when 'cuarta' then 7 when 'quinta' then 8
        else case when p_nivel is not null then (2 + p_nivel)::smallint end end
    when p_categoria = 'aficionados' then case p_division
        when 'primera-federacion' then 3 when 'segunda-federacion' then 4 when 'tercera-federacion' then 5
        when 'division-honor' then 6 when 'division-honor-regional' then 6 when 'preferente' then 6
        when 'autonomica' then 6 when 'superliga' then 6
        when 'primera' then 7 when 'segunda' then 8 when 'tercera' then 9 when 'cuarta' then 10 when 'quinta' then 11
        else case when p_nivel is not null then (5 + p_nivel)::smallint end end
    when p_categoria in ('cadete', 'infantil', 'alevin', 'benjamin', 'prebenjamin') then case p_division
        when 'division-honor' then 1 when 'superliga' then 1 when 'liga-nacional' then 1
        when 'division-honor-regional' then 2 when 'preferente' then 2 when 'autonomica' then 2
        when 'primera' then 3 when 'segunda' then 4 when 'tercera' then 5 when 'cuarta' then 6 when 'quinta' then 7
        else p_nivel end
    else p_nivel end::smallint
$$;

create or replace function analytics.orden_categoria(p_categoria text)
returns smallint language sql immutable parallel safe as $$
  select case p_categoria when 'prebenjamin' then 1 when 'benjamin' then 2 when 'alevin' then 3
    when 'infantil' then 4 when 'cadete' then 5 when 'juvenil' then 6 when 'aficionados' then 7
    when 'veteranos' then 8 else null end::smallint
$$;

-- Horquilla ESTRICTA de nacimiento de la categoría (sin la tolerancia de 0024): sirve para decir «juega por
-- encima de su edad» y para el filtro de edad del ojeo.
create or replace function analytics.nacimiento_de_categoria(p_categoria text, p_anio smallint, out desde smallint, out hasta smallint)
language sql immutable parallel safe as $$
  select (p_anio - d)::smallint, (p_anio - h)::smallint
    from (select case p_categoria when 'juvenil' then 18 when 'cadete' then 15 when 'infantil' then 13
                   when 'alevin' then 11 when 'benjamin' then 9 when 'prebenjamin' then 7 end as d,
                 case p_categoria when 'juvenil' then 16 when 'cadete' then 14 when 'infantil' then 12
                   when 'alevin' then 10 when 'benjamin' then 8 when 'prebenjamin' then 6 end as h) x
$$;

-- ── 6. La temporada de cada jugador, con el desglose por equipos ─────────────────────────────────────
-- Una vista por equipo (para el desglose) y una tabla por jugador y temporada (para listas y ojeo).
create or replace view analytics.minutos_por_equipo as
select s.person_id, s.season_id, se.anio_inicio as anio, s.team_entry_id, te.team_season_id, ts.club_id,
       c.nombre_canonico as club, ts.nombre as equipo, core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre)) as letra,
       ce.id as competition_edition_id, ce.federation_id, ce.nombre_publicado as competicion, ce.categoria, ce.genero,
       ce.modalidad, ce.division, ce.nivel, analytics.escalon(ce.categoria, ce.division, ce.nivel) as escalon,
       pg.tipo as tipo_grupo, pg.nombre as grupo,
       s.convocatorias, s.partidos_demostrados as partidos, s.titularidades, s.suplencias,
       s.minutos_exactos, s.minutos_estimados, s.minutos_posibles, s.minutos_fiables,
       case when s.minutos_posibles > 0 then round(100.0 * coalesce(s.minutos_estimados, 0) / s.minutos_posibles, 1) end as pct_minutos,
       s.goles, s.goles_penalti, s.amarillas, s.rojas as expulsiones, s.dobles_amarillas, s.partidos_sancion,
       s.primera_fecha, s.ultima_fecha, s.veces_portero, s.veces_capitan, s.posicion_habitual
  from analytics.player_team_season_summary s
  join core.season se on se.id = s.season_id
  join core.team_entry te on te.id = s.team_entry_id
  join core.team_season ts on ts.id = te.team_season_id
  join core.club c on c.id = ts.club_id
  join core.phase_group pg on pg.id = te.phase_group_id
  join core.competition_edition ce on ce.id = s.competition_edition_id;

create table if not exists analytics.jugador_temporada (
  person_id               bigint   not null references core.person(id) on delete cascade,
  season_id               smallint not null,
  anio                    smallint not null,
  federaciones            smallint[] not null default '{}',
  club_principal_id       bigint,
  team_season_principal   bigint,
  categoria_principal     text,
  escalon_principal       smallint,
  mejor_escalon           smallint,      -- el más alto (número más bajo) con ≥ 90 minutos o ≥ 2 partidos
  minutos_total           integer,       -- suma de lo calculable (cota inferior si minutos_exactos = false)
  minutos_exactos         boolean  not null default false,
  minutos_principal       integer,
  minutos_superior        integer  not null default 0,   -- mismo club, equipo por encima (A sobre B, juvenil sobre cadete)
  minutos_inferior        integer  not null default 0,   -- mismo club, equipo por debajo
  minutos_otro_club       integer  not null default 0,
  minutos_posibles_principal integer,
  pct_minutos_principal   numeric(5,1),
  partidos                integer  not null default 0,
  titularidades           integer  not null default 0,
  convocatorias           integer  not null default 0,
  goles                   integer  not null default 0,
  goles_penalti           integer  not null default 0,
  amarillas               integer  not null default 0,
  expulsiones             integer  not null default 0,
  partidos_sancion        integer,
  categorias              text[]   not null default '{}',
  por_encima_de_su_edad   boolean  not null default false,  -- minutos en una categoría mayor que la suya
  clubes                  smallint not null default 0,
  cambio_club             text     not null default 'no' check (cambio_club in ('no', 'traspaso', 'simultaneo')),
  fecha_cambio            date,
  es_portero              boolean  not null default false,  -- portero en ≥ 50 % de los partidos jugados
  posicion_habitual       text,
  linea_habitual          text,
  veces_capitan           integer  not null default 0,
  calculado_en            timestamptz not null default now(),
  primary key (person_id, season_id)
);
create index if not exists jugador_temporada_ojeo_idx on analytics.jugador_temporada (anio, categoria_principal, mejor_escalon, minutos_total desc);

create or replace function analytics.proyecta_temporadas(p_personas bigint[])
returns integer language plpgsql as $$
declare v integer;
begin
  delete from analytics.jugador_temporada where person_id = any(p_personas);
  insert into analytics.jugador_temporada (
    person_id, season_id, anio, federaciones, club_principal_id, team_season_principal, categoria_principal,
    escalon_principal, mejor_escalon, minutos_total, minutos_exactos, minutos_principal, minutos_superior,
    minutos_inferior, minutos_otro_club, minutos_posibles_principal, pct_minutos_principal, partidos,
    titularidades, convocatorias, goles, goles_penalti, amarillas, expulsiones, partidos_sancion, categorias,
    por_encima_de_su_edad, clubes, cambio_club, fecha_cambio, es_portero, posicion_habitual, linea_habitual,
    veces_capitan, calculado_en)
  with filas as (
    select m.*, analytics.orden_categoria(m.categoria) as ocat
      from analytics.minutos_por_equipo m where m.person_id = any(p_personas)
  ),
  -- El equipo «de ficha»: más convocatorias; a igualdad, el de MENOS nivel (el B, no el A al que sube).
  por_equipo as (
    select person_id, season_id, team_season_id, club_id, min(ocat) as ocat, min(letra) as letra,
           min(escalon) as escalon, sum(convocatorias) as conv, sum(coalesce(minutos_estimados, 0)) as minutos,
           sum(minutos_posibles) filter (where tipo_grupo = 'liga') as posibles,
           min(primera_fecha) as desde, max(ultima_fecha) as hasta,
           (array_agg(categoria order by convocatorias desc))[1] as categoria
      from filas group by person_id, season_id, team_season_id, club_id
  ),
  principal as (
    select distinct on (person_id, season_id) *
      from por_equipo
     order by person_id, season_id, conv desc, minutos desc, ocat asc, letra desc, escalon desc nulls first
  ),
  papel as (
    select e.*, p.team_season_id as ts_principal,
           case when e.team_season_id = p.team_season_id then 'principal'
                when e.club_id <> p.club_id then 'otro_club'
                when e.ocat > p.ocat then 'superior'
                when e.ocat < p.ocat then 'inferior'
                when e.letra < p.letra then 'superior'
                when e.letra > p.letra then 'inferior'
                when coalesce(e.escalon, 99) < coalesce(p.escalon, 99) then 'superior'
                else 'inferior' end as papel
      from por_equipo e join principal p on p.person_id = e.person_id and p.season_id = e.season_id
  ),
  clubes as (      -- ¿cambió de club? Tramos de fechas por club
    select person_id, season_id, count(distinct club_id) as n,
           bool_or(exists (select 1 from por_equipo o
                            where o.person_id = x.person_id and o.season_id = x.season_id and o.club_id <> x.club_id
                              and o.desde <= x.hasta and o.hasta >= x.desde)) as solapan,
           max(desde) as ultimo_inicio
      from por_equipo x group by person_id, season_id
  )
  select f.person_id, f.season_id, min(f.anio), array_agg(distinct f.federation_id),
         min(p.club_id), min(p.team_season_id), min(p.categoria), min(p.escalon),
         min(f.escalon) filter (where coalesce(f.minutos_estimados, 0) >= 90 or f.partidos >= 2),
         sum(f.minutos_estimados), coalesce(bool_and(f.minutos_fiables) filter (where f.partidos > 0), false),
         (select sum(minutos) from papel x where x.person_id = f.person_id and x.season_id = f.season_id and x.papel = 'principal'),
         coalesce((select sum(minutos) from papel x where x.person_id = f.person_id and x.season_id = f.season_id and x.papel = 'superior'), 0),
         coalesce((select sum(minutos) from papel x where x.person_id = f.person_id and x.season_id = f.season_id and x.papel = 'inferior'), 0),
         coalesce((select sum(minutos) from papel x where x.person_id = f.person_id and x.season_id = f.season_id and x.papel = 'otro_club'), 0),
         min(p.posibles),
         case when min(p.posibles) > 0 then round(100.0 * min(p.minutos) / min(p.posibles), 1) end,
         sum(f.partidos), sum(f.titularidades), sum(f.convocatorias), sum(f.goles), sum(f.goles_penalti),
         sum(f.amarillas), sum(f.expulsiones), sum(f.partidos_sancion),
         array_agg(distinct f.categoria),
         coalesce(bool_or(f.ocat > p.ocat and coalesce(f.minutos_estimados, 0) > 0), false),
         min(cl.n), case when min(cl.n) <= 1 then 'no' when bool_or(cl.solapan) then 'simultaneo' else 'traspaso' end,
         case when min(cl.n) > 1 and not bool_or(cl.solapan) then max(cl.ultimo_inicio) end,
         coalesce(sum(f.veces_portero) * 2 >= nullif(sum(f.partidos), 0), false),
         mode() within group (order by f.posicion_habitual) filter (where f.posicion_habitual is not null),
         core.linea_de_posicion(mode() within group (order by f.posicion_habitual) filter (where f.posicion_habitual is not null)),
         sum(f.veces_capitan), now()
    from filas f
    join principal p on p.person_id = f.person_id and p.season_id = f.season_id
    join clubes cl on cl.person_id = f.person_id and cl.season_id = f.season_id
   group by f.person_id, f.season_id;
  get diagnostics v = row_count;
  return v;
end $$;

comment on function analytics.proyecta_temporadas(bigint[]) is
  'Una fila por jugador y temporada con la suma y el desglose de minutos por papel de equipo. El proyector la '
  'llama con las mismas personas que proyecta_carreras.';

-- ── 7. Árbitros ─────────────────────────────────────────────────────────────────────────────────────
-- El importador crea una persona-árbitro por EDICIÓN (0008: identidad nominal con ámbito de edición). Aquí
-- se agrupan por federación + clave de nombre ordenada (mismo criterio que 0024). Dos árbitros homónimos en
-- la misma federación se juntarían: se acepta (es rarísimo entre colegiados) y se puede separar a mano
-- con core.identity_decision.
-- OJO (medido el 21/10/2026): los recolectores Novanet (Madrid, Valencia) y el de Cataluña guardan en
-- partidos.arbitro TODOS los colegiados unidos con « / » (31.208 partidos: 15.484 de Valencia, 10.722 de
-- Madrid, 5.002 de Cataluña), y el importador creó una «persona» con ese texto entero. El primero es
-- siempre el principal (comprobado en las muestras: «ARBITRO» / «Árbitro/a Principal» va primero), así que
-- aquí se usa sólo lo que va antes del primer « / ». El arreglo de raíz (separar y guardar asistentes con
-- su código) está en PLAN-DEEPSEEK.md §5.3.
create table if not exists analytics.arbitro_persona (
  person_id     bigint   primary key references core.person(id) on delete cascade,
  arbitro_id    bigint   not null,         -- la persona más antigua del grupo
  federation_id smallint not null,
  clave         text,
  nombre        text                       -- el nombre del principal, sin los asistentes
);
create index if not exists arbitro_persona_arbitro_idx on analytics.arbitro_persona (arbitro_id);

create table if not exists analytics.arbitro_temporada (
  arbitro_id             bigint   not null,
  competition_edition_id bigint   not null references core.competition_edition(id) on delete cascade,
  season_id              smallint not null,
  federation_id          smallint not null,
  categoria              text     not null,
  escalon                smallint,
  partidos               integer  not null default 0,
  partidos_con_acta      integer  not null default 0,
  amarillas              integer  not null default 0,
  expulsiones            integer  not null default 0,
  rojas_directas         integer  not null default 0,
  expulsiones_tecnicos   integer  not null default 0,
  penaltis_gol           integer  not null default 0,
  goles                  integer  not null default 0,
  gana_local             integer  not null default 0,
  empate                 integer  not null default 0,
  gana_visitante         integer  not null default 0,
  primary key (arbitro_id, competition_edition_id)
);

create or replace function analytics.recalcula_arbitros()
returns integer language plpgsql as $$
declare v integer;
begin
  truncate analytics.arbitro_persona;
  insert into analytics.arbitro_persona (person_id, arbitro_id, federation_id, clave, nombre)
  with ar as (
    select distinct o.person_id, ce.federation_id,
           core.clave_nombre_persona(btrim(split_part(p.nombre_mostrado, ' / ', 1))) as clave,
           btrim(split_part(p.nombre_mostrado, ' / ', 1)) as nombre
      from core.match_official o
      join core.person p on p.id = o.person_id
      join core.match m on m.id = o.match_id
      join core.phase_group pg on pg.id = m.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
  )
  select person_id,
         case when clave is null then person_id
              else min(person_id) over (partition by federation_id, clave) end,
         federation_id, clave, nombre
    from ar
  on conflict (person_id) do nothing;

  truncate analytics.arbitro_temporada;
  insert into analytics.arbitro_temporada
  with partido as (
    select ap.arbitro_id, m.id as match_id, ce.id as edicion, ce.season_id, ce.federation_id, ce.categoria,
           analytics.escalon(ce.categoria, ce.division, ce.nivel) as escalon, m.goles_local, m.goles_visitante,
           exists (select 1 from core.appearance a where a.match_id = m.id) as con_acta
      from core.match_official o
      join analytics.arbitro_persona ap on ap.person_id = o.person_id
      join core.match m on m.id = o.match_id and m.official_status = 'played'
      join core.phase_group pg on pg.id = m.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
     where o.rol = 'principal'
  ),
  -- Por persona y partido: una expulsión es UNA aunque el acta ponga «doble amarilla» y además «roja».
  porjug as (
    select e.match_id, e.person_id, e.sujeto_tipo,
           count(*) filter (where e.event_type = 'tarjeta_amarilla') as am,
           count(distinct e.minute_base) filter (where e.event_type = 'tarjeta_amarilla') as am_min,
           bool_or(e.event_type = 'tarjeta_roja' and e.subtipo = 'doble_amarilla') as doble,
           bool_or(e.event_type = 'tarjeta_roja' and coalesce(e.subtipo, 'normal') <> 'doble_amarilla') as roja
      from core.match_event e
     where e.match_id in (select match_id from partido) and e.person_id is not null
       and e.event_type in ('tarjeta_amarilla', 'tarjeta_roja')
     group by e.match_id, e.person_id, e.sujeto_tipo
  ),
  tarj as (
    select match_id,
           coalesce(sum(am) filter (where sujeto_tipo = 'jugador'), 0) as am,
           count(*) filter (where sujeto_tipo = 'jugador' and (doble or roja or (am >= 2 and am_min >= 2))) as expulsiones,
           count(*) filter (where sujeto_tipo = 'jugador' and roja and not doble) as directas,
           count(*) filter (where sujeto_tipo = 'tecnico' and (roja or doble)) as tecnicos
      from porjug group by match_id
  ),
  goles as (
    select e.match_id,
           count(*) filter (where e.event_type = 'gol' and e.subtipo = 'penalti') as penaltis,
           count(*) filter (where e.event_type = 'gol') as goles
      from core.match_event e where e.match_id in (select match_id from partido) group by e.match_id
  )
  select p.arbitro_id, p.edicion, min(p.season_id), min(p.federation_id), min(p.categoria), min(p.escalon),
         count(*), count(*) filter (where p.con_acta),
         coalesce(sum(t.am) filter (where p.con_acta), 0),
         coalesce(sum(t.expulsiones) filter (where p.con_acta), 0),
         coalesce(sum(t.directas) filter (where p.con_acta), 0),
         coalesce(sum(t.tecnicos) filter (where p.con_acta), 0),
         coalesce(sum(gl.penaltis) filter (where p.con_acta), 0),
         coalesce(sum(gl.goles) filter (where p.con_acta), 0),
         count(*) filter (where p.goles_local > p.goles_visitante),
         count(*) filter (where p.goles_local = p.goles_visitante),
         count(*) filter (where p.goles_local < p.goles_visitante)
    from partido p
    left join tarj t on t.match_id = p.match_id
    left join goles gl on gl.match_id = p.match_id
   group by p.arbitro_id, p.edicion;
  get diagnostics v = row_count;
  return v;
end $$;

-- Media de la edición, para comparar a cada árbitro con sus colegas en la misma competición.
create or replace view analytics.arbitro_comparado as
select a.*, ce.nombre_publicado as competicion, se.etiqueta as temporada,
       (select ap.nombre from analytics.arbitro_persona ap where ap.arbitro_id = a.arbitro_id
         order by (ap.person_id = a.arbitro_id) desc, length(ap.nombre) desc limit 1) as nombre,
       round(a.amarillas::numeric / nullif(a.partidos_con_acta, 0), 2) as amarillas_por_partido,
       round(a.expulsiones::numeric / nullif(a.partidos_con_acta, 0), 2) as expulsiones_por_partido,
       round(sum(a.amarillas) over w::numeric / nullif(sum(a.partidos_con_acta) over w, 0), 2) as media_edicion_amarillas,
       round(sum(a.expulsiones) over w::numeric / nullif(sum(a.partidos_con_acta) over w, 0), 2) as media_edicion_expulsiones,
       round(100.0 * a.gana_local / nullif(a.partidos, 0), 1) as pct_gana_local
  from analytics.arbitro_temporada a
  join core.competition_edition ce on ce.id = a.competition_edition_id
  join core.season se on se.id = a.season_id
window w as (partition by a.competition_edition_id);

-- ── 8. Ojeo: una fila por persona unificada (entre federaciones) y temporada ─────────────────────────
-- Los percentiles y la puntuación se calculan EN LA CONSULTA sobre el grupo filtrado (ver
-- apps/web/src/consultas/ojeo.ts): «los mejores sub-19 de Castilla y León» compara con los sub-19 de
-- Castilla y León, no con toda España.
-- 0036 la sustituye por la tabla precalculada; se borra antes de crearla para que esta migración se pueda
-- repetir sin chocar con la definición nueva (PostgreSQL no admite cambiar tipos ni nombres de columnas de vista).
drop view if exists analytics.ojeo_temporada;
create view analytics.ojeo_temporada as
with g as (
  select coalesce(pg.grupo_id, j.person_id) as grupo_id, j.*
    from analytics.jugador_temporada j
    left join analytics.persona_grupo pg on pg.person_id = j.person_id
),
nac as (
  select coalesce(pg.grupo_id, pp.person_id) as grupo_id, max(pp.nacimiento_min) as nmin, min(pp.nacimiento_max) as nmax
    from analytics.persona_perfil pp left join analytics.persona_grupo pg on pg.person_id = pp.person_id
   group by 1
),
estricto as (      -- horquilla estricta: la categoría MÁS JOVEN en la que jugó cada temporada
  select grupo_id, max((analytics.nacimiento_de_categoria(c, anio)).desde) as edesde,
         min((analytics.nacimiento_de_categoria(c, anio)).hasta) as ehasta
    from (select grupo_id, anio, (array_agg(cat order by analytics.orden_categoria(cat)))[1] as c
            from g, unnest(g.categorias) cat
           where analytics.orden_categoria(cat) <= 6
           group by grupo_id, anio) x
   group by grupo_id
),
feds as (
  select grupo_id, season_id, array_agg(distinct f) as federaciones
    from g cross join lateral unnest(g.federaciones) f group by grupo_id, season_id
)
select g.grupo_id, g.season_id, g.anio,
       (array_agg(g.person_id order by g.minutos_total desc nulls last))[1] as person_id,
       min(fd.federaciones) as federaciones,
       (array_agg(g.club_principal_id order by g.minutos_total desc nulls last))[1] as club_id,
       (array_agg(g.team_season_principal order by g.minutos_total desc nulls last))[1] as team_season_id,
       (array_agg(g.categoria_principal order by g.minutos_total desc nulls last))[1] as categoria,
       min(g.mejor_escalon) as mejor_escalon,
       sum(g.minutos_total)::integer as minutos, bool_and(g.minutos_exactos) as minutos_exactos,
       max(g.pct_minutos_principal) as pct_minutos,
       sum(g.minutos_superior)::integer as minutos_por_encima,
       sum(g.partidos)::integer as partidos, sum(g.titularidades)::integer as titularidades,
       sum(g.goles)::integer as goles, sum(g.amarillas)::integer as amarillas, sum(g.expulsiones)::integer as expulsiones,
       bool_or(g.por_encima_de_su_edad) as por_encima_de_su_edad, bool_or(g.es_portero) as es_portero,
       max(g.posicion_habitual) as posicion, max(g.linea_habitual) as linea,
       coalesce(max(e.edesde), max(n.nmin)) as nacimiento_desde,
       coalesce(min(e.ehasta), min(n.nmax)) as nacimiento_hasta,
       (max(e.edesde) > min(e.ehasta)) as edad_incoherente,
       (select count(distinct j2.anio) from g j2 where j2.grupo_id = g.grupo_id and j2.anio < g.anio and j2.mejor_escalon <= 2) as temporadas_previas_alto_nivel,
       (select coalesce(sum(j2.minutos_total), 0) from g j2 where j2.grupo_id = g.grupo_id and j2.anio < g.anio) as minutos_previos
  from g
  join feds fd on fd.grupo_id = g.grupo_id and fd.season_id = g.season_id
  left join nac n on n.grupo_id = g.grupo_id
  left join estricto e on e.grupo_id = g.grupo_id
 group by g.grupo_id, g.season_id, g.anio;

comment on view analytics.ojeo_temporada is
  'Base del buscador de talento. Una fila por persona unificada y temporada. La edad sale de las categorías '
  '(no hay fecha de nacimiento en las actas): horquilla estricta de la categoría más joven en que jugó; si no '
  'hay, la tolerante de persona_perfil. edad_incoherente = las temporadas no cuadran (posible unión errónea).';

-- ── 9. Permisos ─────────────────────────────────────────────────────────────────────────────────────
grant select on core.appearance_detalle, core.match_esquema to facylf_lector;
grant select, insert, update, delete on core.appearance_detalle, core.match_esquema to facylf_publicador;
grant select on analytics.parametro_sancion, analytics.sancion_inferida, analytics.jugador_temporada,
                analytics.minutos_por_equipo, analytics.arbitro_persona, analytics.arbitro_temporada,
                analytics.arbitro_comparado, analytics.ojeo_temporada to facylf_lector;
grant select, insert, update, delete on analytics.parametro_sancion, analytics.sancion_inferida,
                analytics.jugador_temporada, analytics.arbitro_persona, analytics.arbitro_temporada to facylf_publicador;
grant select on analytics.minutos_por_equipo, analytics.arbitro_comparado, analytics.ojeo_temporada to facylf_publicador;
grant execute on function core.linea_de_posicion(text), core.posicion_normalizada(text, text),
                          analytics.minutos_partido(text, jsonb, integer),
                          analytics.duracion_con_prorroga(integer, text, integer),
                          analytics.escalon(text, text, smallint), analytics.orden_categoria(text),
                          analytics.nacimiento_de_categoria(text, smallint) to facylf_lector, facylf_publicador;
grant execute on function analytics.proyecta_sanciones_edicion(bigint), analytics.proyecta_temporadas(bigint[]),
                          analytics.recalcula_arbitros() to facylf_publicador;
