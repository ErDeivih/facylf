-- 0036 · Rendimiento: el ojeo pasa de vista a tabla precalculada, e índices para las lecturas de la web.
--
-- Medido (pruebas/sql/volumen.mjs + rendimiento.mjs, 22/10/2026): con 40.000 filas jugador-temporada la
-- consulta `ojeo-jugadores` tardaba 93 s. La vista `analytics.ojeo_temporada` (0029) recalculaba en cada
-- búsqueda a TODOS los jugadores del país y, por cada uno, volvía a recorrer todas las temporadas de todos
-- (`select … from g j2 where j2.grupo_id = g.grupo_id`): coste cuadrático. Con el volumen nacional no acabaría.
--
-- Ahora:
--   · `analytics.ojeo_jugador`: una fila por jugador unificado (grupo de identidad) y temporada, con las
--     mismas columnas que la vista. Las temporadas previas se calculan con ventanas, en una pasada.
--   · `analytics.proyecta_ojeo(personas)`: recalcula sólo los grupos de esas personas (lo llama el proyector
--     después de `proyecta_temporadas`). `analytics.recalcula_ojeo()`: entera (tras cambios de identidad).
--   · La vista `analytics.ojeo_temporada` se queda, leyendo de la tabla, para no romper a nadie.

-- ── 1. Tabla ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists analytics.ojeo_jugador (
  grupo_id                      bigint   not null,
  season_id                     smallint not null,
  anio                          smallint not null,
  person_id                     bigint   not null,
  federaciones                  smallint[] not null default '{}',
  club_id                       bigint,
  team_season_id                bigint,
  categoria                     text,
  mejor_escalon                 smallint,
  minutos                       integer,
  minutos_exactos               boolean,
  pct_minutos                   numeric,
  minutos_por_encima            integer,
  partidos                      integer,
  titularidades                 integer,
  goles                         integer,
  amarillas                     integer,
  expulsiones                   integer,
  por_encima_de_su_edad         boolean,
  es_portero                    boolean,
  posicion                      text,
  linea                         text,
  nacimiento_desde              smallint,
  nacimiento_hasta              smallint,
  edad_incoherente              boolean,
  temporadas_previas_alto_nivel integer not null default 0,
  minutos_previos               bigint  not null default 0,
  calculado_en                  timestamptz not null default now(),
  -- Percentiles (0-100) frente a los de su misma quinta (temporada + año de nacimiento más reciente posible)
  -- en toda España, y la puntuación compuesta. Los rellena analytics.puntua_ojeo() al final de cada pasada.
  p_minutos smallint, p_pct smallint, p_nivel smallint, p_encima smallint, p_continuidad smallint, p_goles smallint,
  p_exp smallint, puntuacion numeric(5,1), quinta_total integer,
  primary key (season_id, grupo_id)
);
-- El buscador siempre filtra por temporada; casi siempre por año de nacimiento; a menudo por federación.
create index if not exists ojeo_nacimiento_idx on analytics.ojeo_jugador (season_id, nacimiento_hasta, nacimiento_desde);
create index if not exists ojeo_federaciones_idx on analytics.ojeo_jugador using gin (federaciones);
create index if not exists ojeo_categoria_idx on analytics.ojeo_jugador (season_id, categoria, mejor_escalon);
create index if not exists ojeo_grupo_idx on analytics.ojeo_jugador (grupo_id);
create index if not exists ojeo_persona_idx on analytics.ojeo_jugador (person_id);
-- Búsqueda amplia (toda España): se lee en orden de puntuación y se para en el límite, sin ordenar nada.
create index if not exists ojeo_puntuacion_idx on analytics.ojeo_jugador (season_id, puntuacion desc nulls last, grupo_id);

comment on table analytics.ojeo_jugador is
  'Base del buscador de talento: una fila por jugador unificado y temporada. La rellena el proyector '
  '(proyecta_ojeo por personas tocadas; recalcula_ojeo entera). Sustituye al cálculo en vivo de la vista de 0029.';

-- ── 2. Cálculo para un conjunto de grupos de identidad (NULL = todos) ─────────────────────────────────
create or replace function analytics.calcula_ojeo(p_grupos bigint[])
returns setof analytics.ojeo_jugador language sql stable as $$
with g as (
  select coalesce(pg.grupo_id, j.person_id) as grupo_id, j.*
    from analytics.jugador_temporada j
    left join analytics.persona_grupo pg on pg.person_id = j.person_id
   where p_grupos is null
      or j.person_id in (select pg2.person_id from analytics.persona_grupo pg2 where pg2.grupo_id = any(p_grupos))
      or j.person_id = any(p_grupos)
),
nac as (
  select coalesce(pg.grupo_id, pp.person_id) as grupo_id, max(pp.nacimiento_min) as nmin, min(pp.nacimiento_max) as nmax
    from analytics.persona_perfil pp left join analytics.persona_grupo pg on pg.person_id = pp.person_id
   where pp.person_id in (select person_id from g)
   group by 1
),
estricto as (
  select grupo_id, max((analytics.nacimiento_de_categoria(c, anio)).desde) as edesde,
         min((analytics.nacimiento_de_categoria(c, anio)).hasta) as ehasta
    from (select grupo_id, anio, (array_agg(cat order by analytics.orden_categoria(cat)))[1] as c
            from g, unnest(g.categorias) cat
           where analytics.orden_categoria(cat) <= 6
           group by grupo_id, anio) x
   group by grupo_id
),
feds as (
  select grupo_id, season_id, array_agg(distinct f order by f) as federaciones
    from g cross join lateral unnest(g.federaciones) f group by grupo_id, season_id
),
t as (
  select g.grupo_id, g.season_id, g.anio,
         (array_agg(g.person_id order by g.minutos_total desc nulls last, g.partidos desc nulls last))[1] as person_id,
         (array_agg(g.club_principal_id order by g.minutos_total desc nulls last, g.partidos desc nulls last))[1] as club_id,
         (array_agg(g.team_season_principal order by g.minutos_total desc nulls last, g.partidos desc nulls last))[1] as team_season_id,
         (array_agg(g.categoria_principal order by g.minutos_total desc nulls last, g.partidos desc nulls last))[1] as categoria,
         min(g.mejor_escalon) as mejor_escalon,
         sum(g.minutos_total)::integer as minutos, bool_and(g.minutos_exactos) as minutos_exactos,
         max(g.pct_minutos_principal) as pct_minutos,
         sum(g.minutos_superior)::integer as minutos_por_encima,
         sum(g.partidos)::integer as partidos, sum(g.titularidades)::integer as titularidades,
         sum(g.goles)::integer as goles, sum(g.amarillas)::integer as amarillas, sum(g.expulsiones)::integer as expulsiones,
         bool_or(g.por_encima_de_su_edad) as por_encima_de_su_edad, bool_or(g.es_portero) as es_portero,
         max(g.posicion_habitual) as posicion, max(g.linea_habitual) as linea
    from g group by g.grupo_id, g.season_id, g.anio
)
select t.grupo_id, t.season_id, t.anio, t.person_id, coalesce(fd.federaciones, '{}'), t.club_id, t.team_season_id, t.categoria,
       t.mejor_escalon, t.minutos, t.minutos_exactos, t.pct_minutos, t.minutos_por_encima, t.partidos, t.titularidades,
       t.goles, t.amarillas, t.expulsiones, t.por_encima_de_su_edad, t.es_portero, t.posicion, t.linea,
       coalesce(e.edesde, n.nmin)::smallint, coalesce(e.ehasta, n.nmax)::smallint, (e.edesde > e.ehasta),
       coalesce(sum((t.mejor_escalon <= 2)::int) over w, 0)::integer,
       coalesce(sum(t.minutos) over w, 0)::bigint,
       now(), null::smallint, null::smallint, null::smallint, null::smallint, null::smallint, null::smallint, null::smallint,
       null::numeric, null::integer
  from t
  left join feds fd on fd.grupo_id = t.grupo_id and fd.season_id = t.season_id
  left join nac n on n.grupo_id = t.grupo_id
  left join estricto e on e.grupo_id = t.grupo_id
window w as (partition by t.grupo_id order by t.anio rows between unbounded preceding and 1 preceding)
$$;

-- Por personas tocadas: se rehacen sus grupos enteros (todas sus temporadas, por las «previas»).
create or replace function analytics.proyecta_ojeo(p_personas bigint[])
returns integer language plpgsql as $$
declare v_grupos bigint[]; n integer;
begin
  select array_agg(distinct coalesce(pg.grupo_id, x.p)) into v_grupos
    from unnest(p_personas) x(p) left join analytics.persona_grupo pg on pg.person_id = x.p;
  if v_grupos is null then return 0; end if;
  -- también los grupos donde estas personas estaban ANTES (una separación de identidad los cambia)
  v_grupos := v_grupos || coalesce((select array_agg(distinct o.grupo_id) from analytics.ojeo_jugador o where o.person_id = any(p_personas)), '{}');
  delete from analytics.ojeo_jugador where grupo_id = any(v_grupos);
  insert into analytics.ojeo_jugador select * from analytics.calcula_ojeo(v_grupos) on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Percentiles por quinta y puntuación. Mismos pesos que tenía la consulta de la web (0029):
-- minutos 30 % · % de minutos 15 % · nivel 20 % · minutos por encima 10 % · continuidad 10 % · goles 10 % · expulsiones −5 %.
-- Donde la competición no apunta cambios (0032) no hay minutos: esos jugadores se comparan entre ellos por titularidades.
create or replace function analytics.puntua_ojeo(p_temporadas smallint[] default null)
returns integer language plpgsql as $$
declare n integer;
begin
  with r as (
    select o.season_id, o.grupo_id,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta, (o.minutos is null) order by coalesce(o.minutos, o.titularidades)) as pm,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta, (o.pct_minutos is null)
                                order by coalesce(o.pct_minutos, 100.0 * o.titularidades / nullif(o.partidos, 0), 0)) as pp,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta order by -coalesce(o.mejor_escalon, 99)) as pn,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta order by coalesce(o.minutos_por_encima, 0)) as pe,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta order by o.temporadas_previas_alto_nivel) as pc,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta order by case when o.es_portero then o.titularidades::numeric
                                       when o.minutos > 0 then o.goles::numeric / o.minutos else coalesce(o.goles, 0)::numeric / greatest(o.partidos, 1) / 90 end) as pg,
           percent_rank() over (partition by o.season_id, o.nacimiento_hasta order by coalesce(o.expulsiones, 0)) as px,
           count(*) over (partition by o.season_id, o.nacimiento_hasta) as tot
      from analytics.ojeo_jugador o
     where p_temporadas is null or o.season_id = any(p_temporadas)
  )
  update analytics.ojeo_jugador o
     set p_minutos = round(r.pm * 100), p_pct = round(r.pp * 100), p_nivel = round(r.pn * 100), p_encima = round(r.pe * 100),
         p_continuidad = round(r.pc * 100), p_goles = round(r.pg * 100), p_exp = round(r.px * 100), quinta_total = r.tot,
         puntuacion = round((100 * greatest(0, 0.30 * r.pm + 0.15 * r.pp + 0.20 * r.pn + 0.10 * r.pe + 0.10 * r.pc + 0.10 * r.pg - 0.05 * r.px) / 0.95)::numeric, 1)
    from r where o.season_id = r.season_id and o.grupo_id = r.grupo_id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function analytics.recalcula_ojeo()
returns integer language plpgsql as $$
declare n integer;
begin
  truncate analytics.ojeo_jugador;
  insert into analytics.ojeo_jugador select * from analytics.calcula_ojeo(null) on conflict do nothing;
  get diagnostics n = row_count;
  perform analytics.puntua_ojeo(null);
  analyze analytics.ojeo_jugador;
  return n;
end $$;

-- La vista de 0029 lee ahora de la tabla (mismas columnas y nombres). Se rehace (los tipos de dos columnas
-- cambian de bigint/numeric a integer/bigint): ninguna vista depende de ella; 0030 y 0032 la leen desde funciones.
drop view if exists analytics.ojeo_temporada;
create view analytics.ojeo_temporada as
select grupo_id, season_id, anio, person_id, federaciones, club_id, team_season_id, categoria, mejor_escalon, minutos,
       minutos_exactos, pct_minutos, minutos_por_encima, partidos, titularidades, goles, amarillas, expulsiones,
       por_encima_de_su_edad, es_portero, posicion, linea, nacimiento_desde, nacimiento_hasta, edad_incoherente,
       temporadas_previas_alto_nivel, minutos_previos
  from analytics.ojeo_jugador;
grant select on analytics.ojeo_temporada to facylf_lector, facylf_publicador, facylf_app;

-- Relleno inicial (con la base ya proyectada; si está vacía, no hace nada).
select analytics.recalcula_ojeo();

-- ── 3. Permisos ──────────────────────────────────────────────────────────────────────────────────────
grant select on analytics.ojeo_jugador to facylf_lector, facylf_app;
grant select, insert, update, delete, truncate on analytics.ojeo_jugador to facylf_publicador;
grant execute on function analytics.calcula_ojeo(bigint[]), analytics.proyecta_ojeo(bigint[]), analytics.recalcula_ojeo(),
  analytics.puntua_ojeo(smallint[]) to facylf_publicador;

-- ── 4. Capacidad de una edición sin recorrer las tablas de hechos ──────────────────────────────────
-- Medido: 0,7-1,5 s por edición porque `match_id in (select id from m)` con `m` en un CTE hacía que el
-- planificador no supiera cuántos partidos eran y recorriera las 685.000 apariciones enteras. Con miles de
-- ediciones, horas. Ahora los partidos van en un array y cada tabla se lee por su índice (match_id, …).
-- Y una medida nueva: cuántos jugadores de la edición tienen código de la federación (para avisar de que la
-- identidad va por nombre). Por edición, no por federación: Cataluña no lo leía hasta el 22/10/2026 (fallo
-- nuestro) y sus actas antiguas siguen sin código hasta que se relean.
alter table analytics.edicion_capacidad add column if not exists personas integer,
                                        add column if not exists personas_con_codigo integer;

create or replace function analytics.recalcula_capacidad_edicion(p_edicion bigint)
returns text language plpgsql as $$
declare v_ids bigint[]; v_nivel text;
  v_partidos int; v_res int; v_acta int; v_sup int; v_cam int; v_tarj int; v_goles int; v_gmin int; v_arb int; v_campo int;
  v_ap int; v_pos int; v_cap int; v_esq int; v_pers int; v_pers_cod int;
  p_ali numeric; p_cam numeric; p_tar numeric; p_min numeric; p_pos numeric;
begin
  select coalesce(array_agg(m.id), '{}'), count(*), count(*) filter (where m.goles_local is not null), count(*) filter (where m.venue_id is not null)
    into v_ids, v_partidos, v_res, v_campo
    from core.match m join core.phase_group pg on pg.id = m.phase_group_id
   where pg.competition_edition_id = p_edicion and m.official_status <> 'cancelled';

  with lados as (
    select a.match_id, a.team_entry_id, bool_or(a.condition = 'substitute') as sup
      from core.appearance a where a.match_id = any(v_ids) group by 1, 2
  ), cambios as (
    select distinct e.match_id, e.team_entry_id from core.match_event e
     where e.match_id = any(v_ids) and e.event_type in ('entra', 'sale')
  )
  select count(distinct l.match_id), count(*) filter (where l.sup),
         count(*) filter (where l.sup and exists (select 1 from cambios c where c.match_id = l.match_id and c.team_entry_id = l.team_entry_id))
    into v_acta, v_sup, v_cam from lados l;

  select count(distinct e.match_id) filter (where e.event_type in ('tarjeta_amarilla', 'tarjeta_roja')),
         count(*) filter (where e.event_type = 'gol'), count(e.minute_base) filter (where e.event_type = 'gol')
    into v_tarj, v_goles, v_gmin
    from core.match_event e where e.match_id = any(v_ids) and e.event_type in ('tarjeta_amarilla', 'tarjeta_roja', 'gol');

  select count(distinct o.match_id) into v_arb from core.match_official o where o.match_id = any(v_ids);
  select count(*), count(d.posicion), count(*) filter (where d.capitan)
    into v_ap, v_pos, v_cap
    from core.appearance a left join core.appearance_detalle d on d.appearance_id = a.id where a.match_id = any(v_ids);
  select count(distinct match_id) into v_esq from core.match_esquema where match_id = any(v_ids);
  select count(distinct a.person_id),
         count(distinct a.person_id) filter (where exists (select 1 from core.person_source_identity psi
                                                            where psi.person_id = a.person_id and psi.codigo_externo is not null))
    into v_pers, v_pers_cod
    from core.appearance a where a.match_id = any(v_ids);

  select max(valor) filter (where clave = 'min_pct_alineaciones'), max(valor) filter (where clave = 'min_pct_cambios'),
         max(valor) filter (where clave = 'min_pct_tarjetas'), max(valor) filter (where clave = 'min_pct_minuto_gol'),
         max(valor) filter (where clave = 'min_pct_posiciones')
    into p_ali, p_cam, p_tar, p_min, p_pos from analytics.parametro_capacidad;

  insert into analytics.edicion_capacidad as c (competition_edition_id, partidos, con_resultado, con_acta, lados_con_suplentes,
      lados_con_cambios, partidos_con_tarjetas, goles, goles_con_minuto, con_arbitro, con_campo, apariciones, con_posicion,
      con_capitan, con_esquema, registra_alineaciones, registra_cambios, registra_tarjetas, registra_minuto_gol,
      registra_posiciones, nivel, calculado_en, personas, personas_con_codigo)
  values (p_edicion, v_partidos, v_res, v_acta, v_sup, v_cam, v_tarj, v_goles, v_gmin, v_arb, v_campo, v_ap, v_pos, v_cap, v_esq,
      v_acta >= greatest(1, p_ali / 100 * v_res),
      v_sup = 0 or 100.0 * v_cam / v_sup >= p_cam,
      v_acta > 0 and 100.0 * v_tarj / v_acta >= p_tar,
      v_goles > 0 and 100.0 * v_gmin / v_goles >= p_min,
      v_ap > 0 and 100.0 * v_pos / v_ap >= p_pos,
      'calendario', now(), v_pers, v_pers_cod)
  on conflict (competition_edition_id) do update set
    partidos = excluded.partidos, con_resultado = excluded.con_resultado, con_acta = excluded.con_acta,
    lados_con_suplentes = excluded.lados_con_suplentes, lados_con_cambios = excluded.lados_con_cambios,
    partidos_con_tarjetas = excluded.partidos_con_tarjetas, goles = excluded.goles, goles_con_minuto = excluded.goles_con_minuto,
    con_arbitro = excluded.con_arbitro, con_campo = excluded.con_campo, apariciones = excluded.apariciones,
    con_posicion = excluded.con_posicion, con_capitan = excluded.con_capitan, con_esquema = excluded.con_esquema,
    registra_alineaciones = excluded.registra_alineaciones, registra_cambios = excluded.registra_cambios,
    registra_tarjetas = excluded.registra_tarjetas, registra_minuto_gol = excluded.registra_minuto_gol,
    registra_posiciones = excluded.registra_posiciones, calculado_en = now(),
    personas = excluded.personas, personas_con_codigo = excluded.personas_con_codigo;

  update analytics.edicion_capacidad set nivel = case
      when registra_alineaciones and registra_cambios and registra_tarjetas then 'completo'
      when registra_alineaciones then 'alineaciones'
      when con_resultado > 0 then 'resultados'
      else 'calendario' end
   where competition_edition_id = p_edicion
  returning nivel into v_nivel;
  return v_nivel;
end $$;

-- ── 5. Temporadas por persona: sin subconsultas correlacionadas ni cruces de todos con todos ─────────
-- Medido: 9,5 s por tanda de 2.000 personas → 1,2 s (mismo resultado fila a fila en 27.090 personas).
create or replace function analytics.proyecta_temporadas(p_personas bigint[])
 RETURNS integer
 LANGUAGE plpgsql
AS $$
declare v integer;
begin
  delete from analytics.jugador_temporada where person_id = any(p_personas);
  -- Las filas de la tanda van a una tabla temporal con estadísticas: con un CTE el planificador no sabía
  -- cuántas eran y cruzaba todas con todas (8 millones de comparaciones por 2.000 personas).
  drop table if exists _jt_filas;
  create temp table _jt_filas on commit drop as
    select m.*, analytics.orden_categoria(m.categoria) as ocat
      from analytics.minutos_por_equipo m where m.person_id = any(p_personas);
  analyze _jt_filas;
  insert into analytics.jugador_temporada (
    person_id, season_id, anio, federaciones, club_principal_id, team_season_principal, categoria_principal,
    escalon_principal, mejor_escalon, minutos_total, minutos_exactos, minutos_principal, minutos_superior,
    minutos_inferior, minutos_otro_club, minutos_posibles_principal, pct_minutos_principal, partidos,
    titularidades, convocatorias, goles, goles_penalti, amarillas, expulsiones, partidos_sancion, categorias,
    por_encima_de_su_edad, clubes, cambio_club, fecha_cambio, es_portero, posicion_habitual, linea_habitual,
    veces_capitan, calculado_en)
  -- El equipo «de ficha»: más convocatorias; a igualdad, el de MENOS nivel (el B, no el A al que sube).
  with por_equipo as (
    select person_id, season_id, team_season_id, club_id, min(ocat) as ocat, min(letra) as letra,
           min(escalon) as escalon, sum(convocatorias) as conv, sum(coalesce(minutos_estimados, 0)) as minutos,
           sum(minutos_posibles) filter (where tipo_grupo = 'liga') as posibles,
           min(primera_fecha) as desde, max(ultima_fecha) as hasta,
           (array_agg(categoria order by convocatorias desc))[1] as categoria
      from _jt_filas group by person_id, season_id, team_season_id, club_id
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
  -- Antes eran subconsultas correlacionadas sobre los CTE (coste cuadrático en el tamaño de la tanda):
  -- 9,5 s por 2.000 personas. Ahora, una agregación por persona y temporada.
  solape as (
    select x.person_id, x.season_id,
           bool_or(exists (select 1 from por_equipo o
                            where o.person_id = x.person_id and o.season_id = x.season_id and o.club_id <> x.club_id
                              and o.desde <= x.hasta and o.hasta >= x.desde)) as solapan
      from por_equipo x
     where x.person_id in (select person_id from por_equipo group by person_id, season_id having count(distinct club_id) > 1)
     group by x.person_id, x.season_id
  ),
  clubes as (      -- ¿cambió de club? Tramos de fechas por club
    select x.person_id, x.season_id, count(distinct x.club_id) as n, coalesce(bool_or(s.solapan), false) as solapan,
           max(x.desde) as ultimo_inicio
      from por_equipo x left join solape s on s.person_id = x.person_id and s.season_id = x.season_id
     group by x.person_id, x.season_id
  ),
  papel_sum as (
    select person_id, season_id,
           sum(minutos) filter (where papel = 'principal') as m_principal,
           coalesce(sum(minutos) filter (where papel = 'superior'), 0) as m_superior,
           coalesce(sum(minutos) filter (where papel = 'inferior'), 0) as m_inferior,
           coalesce(sum(minutos) filter (where papel = 'otro_club'), 0) as m_otro
      from papel group by person_id, season_id
  )
  select f.person_id, f.season_id, min(f.anio), array_agg(distinct f.federation_id),
         min(p.club_id), min(p.team_season_id), min(p.categoria), min(p.escalon),
         min(f.escalon) filter (where coalesce(f.minutos_estimados, 0) >= 90 or f.partidos >= 2),
         sum(f.minutos_estimados), coalesce(bool_and(f.minutos_fiables) filter (where f.partidos > 0), false),
         min(ps.m_principal), min(ps.m_superior), min(ps.m_inferior), min(ps.m_otro),
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
    from _jt_filas f
    join principal p on p.person_id = f.person_id and p.season_id = f.season_id
    join clubes cl on cl.person_id = f.person_id and cl.season_id = f.season_id
    join papel_sum ps on ps.person_id = f.person_id and ps.season_id = f.season_id
   group by f.person_id, f.season_id;
  get diagnostics v = row_count;
  return v;
end $$;

-- ── 6. Proyección de un grupo: partidos y equipos en arrays ──────────────────────────────────────
-- Medido: 871 ms por grupo → 207 ms (`match_id in (select … from partidos)` recorría los 210.000 eventos).
-- Resultado idéntico fila a fila en 40.320 filas jugador-equipo y 2.520 equipos.
create or replace function analytics.proyecta_grupo(p_grupo bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $$
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
  v_ids_equipos  bigint[];   -- 0036: en arrays para que cada tabla de hechos se lea por su índice
  v_ids_partidos bigint[];
begin
  select pg.competition_edition_id, ce.season_id, pg.tipo,
         analytics.duracion_de_grupo(p_grupo)
    into v_edicion, v_season, v_tipo, v_duracion
    from core.phase_group pg
    join core.competition_edition ce on ce.id = pg.competition_edition_id
   where pg.id = p_grupo;
  if v_edicion is null then
    raise exception 'El grupo % no existe en core.phase_group', p_grupo;
  end if;

  select coalesce(array_agg(te.id), '{}') into v_ids_equipos from core.team_entry te where te.phase_group_id = p_grupo;
  select coalesce(array_agg(m.id), '{}') into v_ids_partidos from core.match m where m.phase_group_id = p_grupo;
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
     where a.team_entry_id = any(v_ids_equipos)
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
     where a.team_entry_id = any(v_ids_equipos)
     group by a.match_id, a.person_id, a.team_entry_id
  ),
  evs as (
    select e.*,
           row_number() over (partition by e.match_id, e.person_id, e.team_entry_id, e.event_type
                              order by e.minute_base nulls last, e.source_order) as n_tipo
      from core.match_event e
     where e.match_id = any(v_ids_partidos)
       and e.sujeto_tipo = 'jugador' and e.person_id is not null and e.team_entry_id is not null
  ),
  maxmin as (
    select match_id, max(minute_base) as maximo from core.match_event
     where match_id = any(v_ids_partidos) group by match_id
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
     where team_entry_id = any(v_ids_equipos)
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

-- ── 7. Caché de la web: qué páginas hay que refrescar ───────────────────────────────────────────────
-- La web guarda cada página (o cada consulta) con etiquetas: 'grupo:12', 'equipo:345', 'club:6',
-- 'persona:789', 'edicion:3', 'federacion:cyl', 'ojeo', 'rankings'. Mientras nada cambie, la página sale de
-- la caché sin tocar la base. El proyector, al terminar un grupo, apunta aquí las etiquetas afectadas; la web
-- las consume (POST /api/revalidar del proyector, y además cada minuto por si la web estaba parada) y llama a
-- revalidateTag() de cada una. Así un sábado con 400 actas nuevas sólo se rehacen esas páginas.
create table if not exists ops.invalidacion (
  id        bigint generated always as identity primary key,
  etiqueta  text        not null,
  creada_en timestamptz not null default now(),
  consumida_en timestamptz
);
create index if not exists invalidacion_pendiente_idx on ops.invalidacion (id) where consumida_en is null;

-- Etiquetas de lo que toca un grupo proyectado: el grupo, su edición, su federación, sus equipos y clubes y
-- las personas (que la web usa en fichas de jugador, comparador y ojeo).
create or replace function ops.invalida_grupo(p_grupo bigint, p_personas bigint[] default '{}')
returns integer language plpgsql as $$
declare n integer;
begin
  insert into ops.invalidacion (etiqueta)
  select distinct t from (
    select 'grupo:' || p_grupo as t
    union all select 'edicion:' || pg.competition_edition_id from core.phase_group pg where pg.id = p_grupo
    union all select 'federacion:' || f.codigo from core.phase_group pg join core.competition_edition ce on ce.id = pg.competition_edition_id
                join core.federation f on f.id = ce.federation_id where pg.id = p_grupo
    -- las páginas de competición se piden por (federación, código externo del grupo)
    union all select 'grupo-externo:' || f.codigo || ':' || pg.codigo_externo from core.phase_group pg
                join core.competition_edition ce on ce.id = pg.competition_edition_id join core.federation f on f.id = ce.federation_id
               where pg.id = p_grupo
    union all select 'equipo:' || te.id from core.team_entry te where te.phase_group_id = p_grupo
    union all select 'club:' || ts.club_id from core.team_entry te join core.team_season ts on ts.id = te.team_season_id where te.phase_group_id = p_grupo
    union all select 'persona:' || x from unnest(p_personas) x
    union all select 'rankings'
  ) e
  where not exists (select 1 from ops.invalidacion i where i.etiqueta = e.t and i.consumida_en is null);
  get diagnostics n = row_count;
  return n;
end $$;

-- La web: toma hasta N etiquetas pendientes y las marca consumidas en la misma sentencia.
create or replace function ops.consume_invalidaciones(p_max integer default 2000)
returns setof text language sql as $$
  update ops.invalidacion set consumida_en = now()
   where id in (select id from ops.invalidacion where consumida_en is null order by id limit p_max for update skip locked)
  returning etiqueta
$$;

grant select, insert, update, delete on ops.invalidacion to facylf_publicador;
grant usage, select on all sequences in schema ops to facylf_publicador;
grant execute on function ops.invalida_grupo(bigint, bigint[]) to facylf_publicador;
grant select, update on ops.invalidacion to facylf_app;
grant execute on function ops.consume_invalidaciones(integer) to facylf_app;
