import type { Consulta } from './contratos';

/**
 * ANÁLISIS que convierten tablas en respuestas (pantallas 4 Equipo y 11 Estadísticas de la competición).
 * Cada uno con su gráfico en GRAFICOS.md. Leen por los índices de partido por equipo y por grupo
 * (match_team_date_idx, match_away_date_idx, match_grupo_jornada_idx) y por player_summary_team_idx:
 * nada recorre tablas de hechos enteras (medido en pruebas/sql/rendimiento.mjs).
 * Sólo cuentan partidos con resultado (sin resultado no hay forma ni racha); nada se rellena.
 */

// ── Forma del equipo ─────────────────────────────────────────────────────────────────────────────────
export type FilaForma = {
  jugados: number; ultimos: string; racha_actual: string | null; mayor_sin_perder: number; mayor_victorias: number;
  mayor_sin_ganar: number; casa_j: number; casa_g: number; casa_e: number; casa_p: number; casa_gf: number; casa_gc: number;
  fuera_j: number; fuera_g: number; fuera_e: number; fuera_p: number; fuera_gf: number; fuera_gc: number;
  porterias_a_cero: number; sin_marcar: number; media_gf: number | null; media_gc: number | null;
};
/** Una fila. Parámetros: (1) team_entry_id, (2) cuántos últimos (5 o 10). `ultimos` va del más viejo al más nuevo: «GGEPG». */
export const FORMA_DEL_EQUIPO: Consulta<FilaForma> = {
  nombre: 'forma-del-equipo',
  descripcion: 'Últimos resultados, rachas, casa/fuera, porterías a cero y medias de goles del equipo.',
  plan: 'indexado',
  presupuestoMs: 120,
  columnas: ['jugados', 'ultimos', 'racha_actual', 'mayor_sin_perder', 'mayor_victorias', 'mayor_sin_ganar', 'casa_j', 'casa_g',
    'casa_e', 'casa_p', 'casa_gf', 'casa_gc', 'fuera_j', 'fuera_g', 'fuera_e', 'fuera_p', 'fuera_gf', 'fuera_gc',
    'porterias_a_cero', 'sin_marcar', 'media_gf', 'media_gc'],
  sql: `
    with p as (
      select m.id, coalesce(m.played_at, m.fecha_prevista::timestamptz) as cuando, true as casa, m.goles_local as gf, m.goles_visitante as gc
        from core.match m where m.home_team_entry_id = $1 and m.goles_local is not null and m.goles_visitante is not null
      union all
      select m.id, coalesce(m.played_at, m.fecha_prevista::timestamptz), false, m.goles_visitante, m.goles_local
        from core.match m where m.away_team_entry_id = $1 and m.goles_local is not null and m.goles_visitante is not null
    ),
    r as (
      select p.*, case when gf > gc then 'G' when gf = gc then 'E' else 'P' end as res,
             row_number() over (order by cuando, id) as n
        from p
    ),
    -- Rachas: islas de resultados consecutivos que cumplen la condición (huecos e islas)
    islas as (
      select res, (gf >= gc) as sin_perder, (gf > gc) as gano, (gf <= gc) as sin_ganar, n,
             n - row_number() over (partition by (gf >= gc) order by n) as isla_sp,
             n - row_number() over (partition by (gf > gc) order by n) as isla_v,
             n - row_number() over (partition by (gf <= gc) order by n) as isla_sg,
             n - row_number() over (partition by res order by n) as isla_res
        from r
    ),
    ultima as (select res, isla_res from islas order by n desc limit 1)
    select (select count(*) from r)::int as jugados,
           coalesce((select string_agg(res, '' order by n) from (select * from r order by n desc limit $2) u), '') as ultimos,
           (select u.res || count(*) from islas i join ultima u on i.res = u.res and i.isla_res = u.isla_res group by u.res) as racha_actual,
           coalesce((select max(c) from (select count(*) c from islas where sin_perder group by isla_sp) x), 0)::int as mayor_sin_perder,
           coalesce((select max(c) from (select count(*) c from islas where gano group by isla_v) x), 0)::int as mayor_victorias,
           coalesce((select max(c) from (select count(*) c from islas where sin_ganar group by isla_sg) x), 0)::int as mayor_sin_ganar,
           count(*) filter (where casa)::int as casa_j, count(*) filter (where casa and gf > gc)::int as casa_g,
           count(*) filter (where casa and gf = gc)::int as casa_e, count(*) filter (where casa and gf < gc)::int as casa_p,
           coalesce(sum(gf) filter (where casa), 0)::int as casa_gf, coalesce(sum(gc) filter (where casa), 0)::int as casa_gc,
           count(*) filter (where not casa)::int as fuera_j, count(*) filter (where not casa and gf > gc)::int as fuera_g,
           count(*) filter (where not casa and gf = gc)::int as fuera_e, count(*) filter (where not casa and gf < gc)::int as fuera_p,
           coalesce(sum(gf) filter (where not casa), 0)::int as fuera_gf, coalesce(sum(gc) filter (where not casa), 0)::int as fuera_gc,
           count(*) filter (where gc = 0)::int as porterias_a_cero, count(*) filter (where gf = 0)::int as sin_marcar,
           round(avg(gf), 2)::float8 as media_gf, round(avg(gc), 2)::float8 as media_gc
      from r`,
};

// ── De quién dependen los goles ──────────────────────────────────────────────────────────────────────
export type FilaRepartoGoles = {
  persona_id: number; nombre: string | null; es_menor: boolean; goles: number; pct_goles_equipo: number | null; pct_acumulado: number | null;
  goles_penalti: number; partidos: number; minutos: number | null; goles_por_90: number | null; goles_equipo: number;
};
/** Parámetros: (1) team_entry_id, (2) ver nombres de menores (boolean del permiso), (3) límite. Orden: más goles primero. */
export const REPARTO_DE_GOLES: Consulta<FilaRepartoGoles> = {
  nombre: 'reparto-de-goles',
  descripcion: 'Goleadores del equipo, qué parte de los goles del equipo es de cada uno (y acumulada) y goles por 90.',
  plan: 'indexado',
  presupuestoMs: 120,
  columnas: ['persona_id', 'nombre', 'es_menor', 'goles', 'pct_goles_equipo', 'pct_acumulado', 'goles_penalti', 'partidos',
    'minutos', 'goles_por_90', 'goles_equipo'],
  sql: `
    with eq as (select coalesce(t.goles_favor, 0) as gf from analytics.team_edition_summary t where t.team_entry_id = $1),
    g as (
      select s.person_id, s.goles, s.goles_penalti, s.partidos_demostrados as partidos,
             case when s.minutos_fiables then s.minutos_exactos end as minutos
        from analytics.player_team_season_summary s
       where s.team_entry_id = $1 and s.goles > 0
    )
    select g.person_id as persona_id, case when p.es_menor and not $2::boolean then null else p.nombre_mostrado end as nombre,
           p.es_menor, g.goles::int, round(100.0 * g.goles / nullif((select gf from eq), 0), 1)::float8 as pct_goles_equipo,
           round(100.0 * sum(g.goles) over (order by g.goles desc, g.person_id) / nullif((select gf from eq), 0), 1)::float8 as pct_acumulado,
           g.goles_penalti::int, g.partidos::int, g.minutos,
           case when g.minutos > 0 then round(90.0 * g.goles / g.minutos, 2) end::float8 as goles_por_90,
           coalesce((select gf from eq), 0)::int as goles_equipo
      from g join core.person p on p.id = g.person_id
     order by g.goles desc, g.person_id
     limit $3`,
};

// ── Rachas de todo el grupo ──────────────────────────────────────────────────────────────────────────
export type FilaRachaGrupo = {
  team_entry_id: number; equipo: string; jugados: number; ultimos5: string; racha_actual: string | null;
  mayor_sin_perder: number; mayor_sin_ganar: number; puntos_ultimos5: number;
};
/** Parámetros: (1) phase_group_id. Orden: mejor forma reciente (puntos en los últimos 5). */
export const RACHAS_DEL_GRUPO: Consulta<FilaRachaGrupo> = {
  nombre: 'rachas-del-grupo',
  descripcion: 'Forma de cada equipo del grupo: últimos 5, racha actual, rachas más largas, puntos recientes.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['team_entry_id', 'equipo', 'jugados', 'ultimos5', 'racha_actual', 'mayor_sin_perder', 'mayor_sin_ganar', 'puntos_ultimos5'],
  sql: `
    with p as (
      select m.home_team_entry_id as te, m.id, coalesce(m.played_at, m.fecha_prevista::timestamptz) as cuando, m.goles_local as gf, m.goles_visitante as gc
        from core.match m where m.phase_group_id = $1 and m.goles_local is not null and m.goles_visitante is not null and m.home_team_entry_id is not null
      union all
      select m.away_team_entry_id, m.id, coalesce(m.played_at, m.fecha_prevista::timestamptz), m.goles_visitante, m.goles_local
        from core.match m where m.phase_group_id = $1 and m.goles_local is not null and m.goles_visitante is not null and m.away_team_entry_id is not null
    ),
    r as (
      select te, gf, gc, case when gf > gc then 'G' when gf = gc then 'E' else 'P' end as res,
             row_number() over (partition by te order by cuando, id) as n,
             row_number() over (partition by te order by cuando desc, id desc) as desde_final
        from p
    ),
    i as (
      select r.*, n - row_number() over (partition by te, (gf >= gc) order by n) as isla_sp,
                  n - row_number() over (partition by te, (gf <= gc) order by n) as isla_sg,
                  n - row_number() over (partition by te, res order by n) as isla_res
        from r
    ),
    por_equipo as (
      select te, count(*)::int as jugados,
             string_agg(res, '' order by n) filter (where desde_final <= 5) as ultimos5,
             sum(case res when 'G' then 3 when 'E' then 1 else 0 end) filter (where desde_final <= 5)::int as puntos_ultimos5
        from i group by te
    ),
    actual as (
      select i.te, i.res || count(*) as racha
        from i join (select te, res, isla_res from i where desde_final = 1) u on u.te = i.te and u.res = i.res and u.isla_res = i.isla_res
       group by i.te, i.res
    ),
    largas as (
      select te, coalesce(max(c) filter (where k = 'sp'), 0)::int as sp, coalesce(max(c) filter (where k = 'sg'), 0)::int as sg
        from (select te, 'sp' k, count(*) c from i where gf >= gc group by te, isla_sp
              union all select te, 'sg', count(*) from i where gf <= gc group by te, isla_sg) x
       group by te
    )
    select te.id as team_entry_id, coalesce(ts.nombre, te.nombre_en_fuente) as equipo, coalesce(pe.jugados, 0) as jugados,
           coalesce(pe.ultimos5, '') as ultimos5, a.racha as racha_actual, coalesce(l.sp, 0) as mayor_sin_perder,
           coalesce(l.sg, 0) as mayor_sin_ganar, coalesce(pe.puntos_ultimos5, 0) as puntos_ultimos5
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      left join por_equipo pe on pe.te = te.id
      left join actual a on a.te = te.id
      left join largas l on l.te = te.id
     where te.phase_group_id = $1
     order by puntos_ultimos5 desc, mayor_sin_perder desc, equipo`,
};

export const PARAMETROS_ANALISIS: Record<string, readonly unknown[]> = {
  'forma-del-equipo': [1, 5],
  'reparto-de-goles': [1, false, 30],
  'rachas-del-grupo': [1],
};

export const CONSULTAS_ANALISIS = [FORMA_DEL_EQUIPO, REPARTO_DE_GOLES, RACHAS_DEL_GRUPO] as const;
