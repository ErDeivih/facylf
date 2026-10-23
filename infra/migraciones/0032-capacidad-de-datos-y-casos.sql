-- 0032 · Qué registra de verdad cada competición, y gestión de casos raros fila a fila
--
-- Por qué (medido el 22/10/2026 sobre las colas de 17 federaciones, ver COBERTURA-FEDERACIONES.md):
--   · Hay competiciones que NO apuntan los cambios aunque tengan suplentes: Andalucía 2025-26 sólo en el 2 %
--     de las actas con alineación (es casi todo fútbol base), Ceuta y Melilla en el 5-12 %, Euskadi en el 0 %
--     hasta 2022-23. Con «titular = 90 minutos, suplente = 0» se inventarían minutos.
--   · Canarias 2024-25 no da el minuto de ningún gol; Araba, Las Palmas y Tenerife sólo en el 27-45 %.
--   · Castilla y León 2016-17 y 2018-19 no tienen ninguna tarjeta en las actas; Cataluña no tiene ni cambios
--     ni tarjetas (sólo goles).
--   → Los minutos, la disciplina y los gráficos por tramo sólo se calculan y se enseñan donde la competición los
--     registra. Se mide por EDICIÓN (cada competición y temporada), no por federación: dentro de una misma
--     federación conviven ligas completas y ligas de base que sólo dan resultado y alineación.
--   · David (22/10): «eso de las casuísticas… debes tú gestionarlo. Todo.» → `ops.caso_dato`: cada caso raro
--     detectado fila a fila, con estado (abierto, confirmado, corregido, descartado) y cierre automático
--     cuando deja de darse.

-- ── 1. Capacidad de cada edición ────────────────────────────────────────────────────────────────────
create table if not exists analytics.edicion_capacidad (
  competition_edition_id bigint primary key references core.competition_edition(id) on delete cascade,
  partidos               integer not null,
  con_resultado          integer not null,
  con_acta               integer not null,      -- partidos con alineación (apariciones)
  lados_con_suplentes    integer not null,
  lados_con_cambios      integer not null,
  partidos_con_tarjetas  integer not null,
  goles                  integer not null,
  goles_con_minuto       integer not null,
  con_arbitro            integer not null,
  con_campo              integer not null,
  apariciones            integer not null,
  con_posicion           integer not null,
  con_capitan            integer not null,
  con_esquema            integer not null,
  registra_alineaciones  boolean not null,
  registra_cambios       boolean not null,      -- ≥ 40 % de los lados con suplentes apuntan algún cambio
  registra_tarjetas      boolean not null,      -- ≥ 15 % de los partidos con acta tienen alguna tarjeta
  registra_minuto_gol    boolean not null,      -- ≥ 80 % de los goles con minuto
  registra_posiciones    boolean not null,      -- ≥ 50 % de las apariciones con posición
  nivel                  text    not null check (nivel in ('completo', 'alineaciones', 'resultados', 'calendario')),
  calculado_en           timestamptz not null default now()
);

create table if not exists analytics.parametro_capacidad (
  clave text primary key, valor numeric not null, descripcion text not null
);
insert into analytics.parametro_capacidad values
  ('min_pct_cambios', 40, '% de lados con suplentes que apuntan algún cambio para dar por buenos los minutos'),
  ('min_pct_tarjetas', 15, '% de partidos con acta y alguna tarjeta para enseñar disciplina'),
  ('min_pct_minuto_gol', 80, '% de goles con minuto para enseñar goles por tramo'),
  ('min_pct_posiciones', 50, '% de apariciones con posición para filtrar por posición'),
  ('min_pct_alineaciones', 30, '% de partidos con resultado que tienen alineación')
on conflict (clave) do nothing;

create or replace function analytics.recalcula_capacidad_edicion(p_edicion bigint)
returns text language plpgsql as $$
declare v_nivel text;
begin
  insert into analytics.edicion_capacidad
  with m as (
    select m.* from core.match m join core.phase_group pg on pg.id = m.phase_group_id
     where pg.competition_edition_id = p_edicion and m.official_status <> 'cancelled'
  ),
  lados as (
    select a.match_id, a.team_entry_id, bool_or(a.condition = 'substitute') as sup
      from core.appearance a where a.match_id in (select id from m) group by 1, 2
  ),
  cambios as (
    select distinct e.match_id, e.team_entry_id from core.match_event e
     where e.match_id in (select id from m) and e.event_type in ('entra', 'sale')
  ),
  tarj as (select distinct match_id from core.match_event where match_id in (select id from m) and event_type in ('tarjeta_amarilla', 'tarjeta_roja')),
  goles as (select count(*) n, count(minute_base) con_min from core.match_event where match_id in (select id from m) and event_type = 'gol'),
  det as (
    select count(*) ap, count(d.posicion) pos, count(d.capitan) filter (where d.capitan) cap
      from core.appearance a left join core.appearance_detalle d on d.appearance_id = a.id where a.match_id in (select id from m)
  ),
  x as (
    select (select count(*) from m) partidos,
           (select count(*) from m where goles_local is not null) con_resultado,
           (select count(distinct match_id) from lados) con_acta,
           (select count(*) from lados where sup) lados_sup,
           (select count(*) from lados l where l.sup and exists (select 1 from cambios c where c.match_id = l.match_id and c.team_entry_id = l.team_entry_id)) lados_cam,
           (select count(*) from tarj) con_tarj,
           (select n from goles) goles, (select con_min from goles) goles_min,
           (select count(*) from m where exists (select 1 from core.match_official o where o.match_id = m.id)) con_arb,
           (select count(*) from m where venue_id is not null) con_campo,
           (select ap from det) ap, (select pos from det) pos, (select cap from det) cap,
           (select count(distinct match_id) from core.match_esquema where match_id in (select id from m)) esq
  ),
  p as (select clave, valor from analytics.parametro_capacidad)
  select p_edicion, x.partidos, x.con_resultado, x.con_acta, x.lados_sup, x.lados_cam, x.con_tarj, x.goles, x.goles_min,
         x.con_arb, x.con_campo, x.ap, x.pos, x.cap, x.esq,
         x.con_acta >= greatest(1, (select valor from p where clave = 'min_pct_alineaciones') / 100 * x.con_resultado),
         x.lados_sup = 0 or 100.0 * x.lados_cam / x.lados_sup >= (select valor from p where clave = 'min_pct_cambios'),
         x.con_acta > 0 and 100.0 * x.con_tarj / x.con_acta >= (select valor from p where clave = 'min_pct_tarjetas'),
         x.goles > 0 and 100.0 * x.goles_min / x.goles >= (select valor from p where clave = 'min_pct_minuto_gol'),
         x.ap > 0 and 100.0 * x.pos / x.ap >= (select valor from p where clave = 'min_pct_posiciones'),
         'calendario', now()
    from x
  on conflict (competition_edition_id) do update set
    partidos = excluded.partidos, con_resultado = excluded.con_resultado, con_acta = excluded.con_acta,
    lados_con_suplentes = excluded.lados_con_suplentes, lados_con_cambios = excluded.lados_con_cambios,
    partidos_con_tarjetas = excluded.partidos_con_tarjetas, goles = excluded.goles, goles_con_minuto = excluded.goles_con_minuto,
    con_arbitro = excluded.con_arbitro, con_campo = excluded.con_campo, apariciones = excluded.apariciones,
    con_posicion = excluded.con_posicion, con_capitan = excluded.con_capitan, con_esquema = excluded.con_esquema,
    registra_alineaciones = excluded.registra_alineaciones, registra_cambios = excluded.registra_cambios,
    registra_tarjetas = excluded.registra_tarjetas, registra_minuto_gol = excluded.registra_minuto_gol,
    registra_posiciones = excluded.registra_posiciones, calculado_en = now();

  update analytics.edicion_capacidad set nivel = case
      when registra_alineaciones and registra_cambios and registra_tarjetas then 'completo'
      when registra_alineaciones then 'alineaciones'
      when con_resultado > 0 then 'resultados'
      else 'calendario' end
   where competition_edition_id = p_edicion
  returning nivel into v_nivel;
  return v_nivel;
end $$;

comment on function analytics.recalcula_capacidad_edicion(bigint) is
  'Mide qué registra la edición. El proyector la llama UNA vez por edición y pasada, ANTES de proyectar sus grupos: '
  'proyecta_grupo (v3) no calcula minutos donde registra_cambios = false.';

-- Resumen por federación y temporada (página de cobertura y decisiones de interfaz).
create or replace view analytics.federacion_capacidad as
select f.codigo as federacion, f.nombre, se.etiqueta as temporada, se.orden,
       count(*) as ediciones, sum(c.partidos) as partidos,
       round(100.0 * sum(c.con_resultado) / nullif(sum(c.partidos), 0), 1) as pct_resultado,
       round(100.0 * sum(c.con_acta) / nullif(sum(c.con_resultado), 0), 1) as pct_alineacion,
       round(100.0 * sum(c.lados_con_cambios) / nullif(sum(c.lados_con_suplentes), 0), 1) as pct_cambios,
       round(100.0 * sum(c.partidos_con_tarjetas) / nullif(sum(c.con_acta), 0), 1) as pct_tarjetas,
       round(100.0 * sum(c.goles_con_minuto) / nullif(sum(c.goles), 0), 1) as pct_minuto_gol,
       round(100.0 * sum(c.con_arbitro) / nullif(sum(c.partidos), 0), 1) as pct_arbitro,
       round(100.0 * sum(c.con_posicion) / nullif(sum(c.apariciones), 0), 1) as pct_posicion,
       count(*) filter (where c.nivel = 'completo') as ediciones_completas,
       count(*) filter (where c.nivel = 'alineaciones') as ediciones_alineaciones,
       count(*) filter (where c.nivel in ('resultados', 'calendario')) as ediciones_solo_resultados
  from analytics.edicion_capacidad c
  join core.competition_edition ce on ce.id = c.competition_edition_id
  join core.federation f on f.id = ce.federation_id
  join core.season se on se.id = ce.season_id
 group by f.codigo, f.nombre, se.etiqueta, se.orden;

-- ── 2. proyecta_grupo v3: minutos sólo donde se apuntan los cambios ─────────────────────────────────
-- Se reutiliza la v2 entera: la única diferencia es la duración, que pasa a NULL (= «minutos no
-- calculables», como en sala) cuando la edición no registra cambios. Partidos, titularidades, goles y
-- tarjetas se siguen contando.
create or replace function analytics.duracion_de_grupo(p_grupo bigint)
returns integer language sql stable as $$
  select case when coalesce(c.registra_cambios, true)
              then analytics.duracion_reglamentaria(ce.modalidad, ce.categoria) end
    from core.phase_group pg
    join core.competition_edition ce on ce.id = pg.competition_edition_id
    left join analytics.edicion_capacidad c on c.competition_edition_id = ce.id
   where pg.id = p_grupo
$$;

do $$
declare src text;
begin
  -- Toma el cuerpo actual de proyecta_grupo (v2, 0029) y cambia sólo la línea de la duración. Así no hay dos
  -- copias de 200 líneas que mantener; si la v2 cambia en una migración futura, esta sustitución se revisa.
  select pg_get_functiondef('analytics.proyecta_grupo(bigint)'::regprocedure) into src;
  if position('analytics.duracion_reglamentaria(ce.modalidad, ce.categoria)' in src) = 0 then
    raise exception 'proyecta_grupo no tiene la forma esperada (v2 de 0029): revisar 0032';
  end if;
  src := replace(src, 'analytics.duracion_reglamentaria(ce.modalidad, ce.categoria)', 'analytics.duracion_de_grupo(p_grupo)');
  execute src;
end $$;

create or replace function analytics.version_metricas()
returns integer language sql immutable parallel safe as $$ select 3 $$;

-- ── 3. Casos de datos, fila a fila ──────────────────────────────────────────────────────────────────
-- `codigo` = el número del caso en docs/plataforma-web/CASUISTICAS.md (1.3, 2.8…) o E*/P* para los de
-- edición y partido. Un caso descartado por un humano NO vuelve a abrirse (la clave única lo impide).
create table if not exists ops.caso_dato (
  id                     bigint generated always as identity primary key,
  codigo                 text    not null,
  titulo                 text    not null,
  severidad              text    not null check (severidad in ('info', 'aviso', 'grave')),
  entidad                text    not null,           -- 'partido:123', 'persona:45', 'edicion:9', 'grupo_persona:45'
  competition_edition_id bigint,
  match_id               bigint,
  person_id              bigint,
  detalle                jsonb   not null default '{}'::jsonb,
  estado                 text    not null default 'abierto'
                           check (estado in ('abierto', 'confirmado', 'corregido', 'descartado', 'resuelto_solo')),
  tratamiento            text    not null,           -- qué hace la plataforma con él (automático)
  detectado_en           timestamptz not null default now(),
  visto_en               timestamptz not null default now(),
  revisado_por           text,
  revisado_en            timestamptz,
  nota                   text,
  unique (codigo, entidad)
);
create index if not exists caso_dato_abiertos_idx on ops.caso_dato (estado, severidad, codigo) where estado in ('abierto', 'confirmado');
create index if not exists caso_dato_edicion_idx on ops.caso_dato (competition_edition_id);

-- Detecta los casos de una edición (y, con p_edicion NULL, los globales de identidad). Devuelve cuántos
-- hay abiertos. Lo que antes estaba abierto y ya no se detecta pasa a 'resuelto_solo'.
create or replace function ops.detecta_casos(p_edicion bigint)
returns jsonb language plpgsql as $$
declare v_ini timestamptz := clock_timestamp(); v_n int;
begin
  create temporary table if not exists _casos (codigo text, titulo text, severidad text, entidad text,
    competition_edition_id bigint, match_id bigint, person_id bigint, detalle jsonb, tratamiento text) on commit drop;
  truncate _casos;

  if p_edicion is not null then
    -- E1-E3: la edición no registra algo (automático: se oculta y no se calcula)
    insert into _casos
    select 'E1', 'La competición no apunta los cambios', 'info', 'edicion:' || c.competition_edition_id, c.competition_edition_id, null::bigint, null::bigint,
           jsonb_build_object('lados_con_suplentes', c.lados_con_suplentes, 'lados_con_cambios', c.lados_con_cambios),
           'Minutos no calculables en toda la competición; se enseñan partidos y titularidades'
      from analytics.edicion_capacidad c where c.competition_edition_id = p_edicion and not c.registra_cambios and c.lados_con_suplentes > 0
    union all
    select 'E2', 'La competición no apunta el minuto de los goles', 'info', 'edicion:' || c.competition_edition_id, c.competition_edition_id, null::bigint, null::bigint,
           jsonb_build_object('goles', c.goles, 'con_minuto', c.goles_con_minuto), 'Sin gráfico de goles por tramo'
      from analytics.edicion_capacidad c where c.competition_edition_id = p_edicion and not c.registra_minuto_gol and c.goles > 0
    union all
    select 'E3', 'La competición no apunta tarjetas', 'info', 'edicion:' || c.competition_edition_id, c.competition_edition_id, null::bigint, null::bigint,
           jsonb_build_object('con_acta', c.con_acta, 'con_tarjetas', c.partidos_con_tarjetas), 'Sin disciplina ni sanciones'
      from analytics.edicion_capacidad c where c.competition_edition_id = p_edicion and not c.registra_tarjetas and c.con_acta > 10;

    -- 1.3 Dos amarillas al mismo jugador en el mismo minuto
    insert into _casos
    select '1.3', 'Amarilla repetida en el mismo minuto', 'aviso', 'partido:' || e.match_id || ':persona:' || e.person_id, p_edicion, e.match_id, e.person_id,
           jsonb_build_object('minuto', e.minute_base, 'veces', count(*)), 'No cuenta como doble amarilla'
      from core.match_event e join core.match m on m.id = e.match_id join core.phase_group pg on pg.id = m.phase_group_id
     where pg.competition_edition_id = p_edicion and e.event_type = 'tarjeta_amarilla' and e.person_id is not null and e.minute_base is not null
     group by e.match_id, e.person_id, e.minute_base having count(*) > 1;

    -- P1 Goles del acta que no cuadran con el marcador
    insert into _casos
    select 'P1', 'Los goles del acta no cuadran con el marcador', 'aviso', 'partido:' || m.id, p_edicion, m.id, null,
           jsonb_build_object('marcador', m.goles_local || '-' || m.goles_visitante, 'acta', x.gl || '-' || x.gv),
           'La clasificación usa el marcador; los goleadores, el acta'
      from core.match m join core.phase_group pg on pg.id = m.phase_group_id
      join lateral (select count(*) filter (where coalesce(e.lado_beneficiado, e.lado) = 'local') gl,
                           count(*) filter (where coalesce(e.lado_beneficiado, e.lado) = 'visitante') gv
                      from core.match_event e where e.match_id = m.id and e.event_type = 'gol') x on true
     where pg.competition_edition_id = p_edicion and m.goles_local is not null
       and exists (select 1 from core.appearance a where a.match_id = m.id)
       and (x.gl + x.gv) > 0 and (x.gl <> m.goles_local or x.gv <> m.goles_visitante);

    -- P2 Jugado hace más de 7 días y sin acta
    insert into _casos
    select 'P2', 'Partido jugado sin acta', 'info', 'partido:' || m.id, p_edicion, m.id, null,
           jsonb_build_object('fecha', coalesce(m.played_at::date, m.fecha_prevista)), 'Sin minutos ni goleadores de ese partido'
      from core.match m join core.phase_group pg on pg.id = m.phase_group_id
      join analytics.edicion_capacidad c on c.competition_edition_id = pg.competition_edition_id and c.registra_alineaciones
     where pg.competition_edition_id = p_edicion and m.goles_local is not null
       and coalesce(m.played_at::date, m.fecha_prevista) < current_date - 7
       and not exists (select 1 from core.appearance a where a.match_id = m.id);

    -- P3 Alineación imposible en fútbol 11 (más de 11 titulares o menos de 7)
    insert into _casos
    select 'P3', 'Alineación con un número de titulares imposible', 'aviso', 'partido:' || a.match_id || ':equipo:' || a.team_entry_id, p_edicion, a.match_id, null,
           jsonb_build_object('titulares', count(*) filter (where a.condition = 'starter')), 'Minutos de ese equipo en ese partido no calculables'
      from core.appearance a join core.match m on m.id = a.match_id join core.phase_group pg on pg.id = m.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id and ce.modalidad = 'futbol11'
     where pg.competition_edition_id = p_edicion
     group by a.match_id, a.team_entry_id
    having count(*) filter (where a.condition = 'starter') not between 7 and 11 and count(*) filter (where a.condition = 'starter') > 0;

    -- 3.5 Expulsado que juega el partido siguiente
    insert into _casos
    select '3.5', 'Expulsado que jugó el partido siguiente', 'info', 'partido:' || s.match_id || ':persona:' || s.person_id, p_edicion, s.match_id, s.person_id,
           jsonb_build_object('motivo', s.motivo), 'Se enseña 0 partidos de sanción'
      from analytics.sancion_inferida s
     where s.competition_edition_id = p_edicion and s.motivo <> 'ciclo_amarillas' and s.partidos_perdidos = 0 and s.cierre = 'reaparece';
  else
    -- 2.8 Titular en dos partidos a la misma hora (temporadas en curso y anterior)
    insert into _casos
    select '2.8', 'Titular en dos partidos a la misma hora', 'grave', 'persona:' || a.person_id || ':' || m.played_at, null, min(a.match_id), a.person_id,
           jsonb_build_object('partidos', array_agg(distinct a.match_id), 'cuando', m.played_at), 'Revisar la identidad o la fecha'
      from core.appearance a join core.match m on m.id = a.match_id
     where a.condition = 'starter' and m.played_at > now() - interval '400 days'
     group by a.person_id, m.played_at having count(distinct a.match_id) > 1;

    -- 4.3 Edad incoherente tras unir fichas
    insert into _casos
    select '4.3', 'Las temporadas no cuadran con una sola edad', 'aviso', 'grupo_persona:' || o.grupo_id, null, null, o.person_id,
           jsonb_build_object('desde', o.nacimiento_desde, 'hasta', o.nacimiento_hasta), 'Revisar la unión entre federaciones'
      from analytics.ojeo_temporada o where o.edad_incoherente
     group by o.grupo_id, o.person_id, o.nacimiento_desde, o.nacimiento_hasta;

    -- 2.6 Dos clubes a la vez
    insert into _casos
    select '2.6', 'En dos clubes a la vez', 'info', 'persona:' || j.person_id || ':temporada:' || j.season_id, null, null, j.person_id,
           jsonb_build_object('temporada', j.season_id, 'clubes', j.clubes), 'Revisar: sala + fútbol, convenio u homónimo'
      from analytics.jugador_temporada j where j.cambio_club = 'simultaneo';
  end if;

  -- Volcar: nuevos se abren; existentes se refrescan; lo que ya no aparece en este ámbito se resuelve solo.
  insert into ops.caso_dato (codigo, titulo, severidad, entidad, competition_edition_id, match_id, person_id, detalle, tratamiento)
  select distinct on (codigo, entidad) codigo, titulo, severidad, entidad, competition_edition_id, match_id, person_id, detalle, tratamiento from _casos
  on conflict (codigo, entidad) do update set detalle = excluded.detalle, visto_en = now(),
    estado = case when ops.caso_dato.estado = 'resuelto_solo' then 'abierto' else ops.caso_dato.estado end;

  update ops.caso_dato c set estado = 'resuelto_solo', visto_en = now()
   where c.estado in ('abierto', 'confirmado')
     and ((p_edicion is not null and c.competition_edition_id = p_edicion and c.codigo in ('E1','E2','E3','1.3','P1','P2','P3','3.5'))
          or (p_edicion is null and c.codigo in ('2.8','4.3','2.6')))
     and not exists (select 1 from _casos x where x.codigo = c.codigo and x.entidad = c.entidad);

  select count(*) into v_n from ops.caso_dato where estado in ('abierto', 'confirmado')
     and (p_edicion is null or competition_edition_id = p_edicion);
  return jsonb_build_object('ambito', coalesce(p_edicion::text, 'global'), 'abiertos', v_n,
                            'ms', (extract(epoch from clock_timestamp() - v_ini) * 1000)::int);
end $$;

create or replace function ops.revisa_caso(p_id bigint, p_estado text, p_usuario text, p_nota text default null)
returns void language plpgsql as $$
begin
  if p_estado not in ('confirmado', 'corregido', 'descartado') then raise exception 'ESTADO_NO_VALIDO'; end if;
  if not app.puede(p_usuario, 'confirmar_identidades') then raise exception 'SIN_PERMISO'; end if;
  update ops.caso_dato set estado = p_estado, revisado_por = p_usuario, revisado_en = now(), nota = p_nota where id = p_id;
end $$;

create or replace view ops.casos_resumen as
select codigo, min(titulo) as titulo,
       (array_agg(severidad order by case severidad when 'grave' then 3 when 'aviso' then 2 else 1 end desc))[1] as severidad, min(tratamiento) as tratamiento,
       count(*) filter (where estado = 'abierto') as abiertos, count(*) filter (where estado = 'confirmado') as confirmados,
       count(*) filter (where estado = 'descartado') as descartados, count(*) filter (where estado = 'resuelto_solo') as resueltos_solos,
       max(visto_en) as ultima_vez
  from ops.caso_dato group by codigo;

-- ── 4. Permisos ─────────────────────────────────────────────────────────────────────────────────────
grant select on analytics.edicion_capacidad, analytics.federacion_capacidad, analytics.parametro_capacidad to facylf_lector, facylf_app;
grant select, insert, update, delete on analytics.edicion_capacidad to facylf_publicador;
grant select, update on analytics.parametro_capacidad to facylf_publicador;
grant select on analytics.federacion_capacidad to facylf_publicador;
grant execute on function analytics.recalcula_capacidad_edicion(bigint), ops.detecta_casos(bigint) to facylf_publicador;
grant execute on function analytics.duracion_de_grupo(bigint) to facylf_lector, facylf_publicador;
grant select, insert, update on ops.caso_dato to facylf_publicador;
grant usage, select on all sequences in schema ops to facylf_publicador;
grant select on ops.caso_dato, ops.casos_resumen to facylf_app;
grant execute on function ops.revisa_caso(bigint, text, text, text) to facylf_app;
grant update (estado, revisado_por, revisado_en, nota) on ops.caso_dato to facylf_app;
