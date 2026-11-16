import type { Consulta } from './contratos';

/**
 * Consultas de evolución y de lo que viene: posición por jornada de un equipo, forma previa a un
 * partido, y los cruces previstos de un grupo o de un equipo.
 *
 * Las que leen `core.calendario_pendiente` necesitan la migración 0067. Quien las llama lo hace dentro
 * de un `try` y sigue sin ese bloque si fallan: por eso no están en ninguna lista de contrato.
 */

export type FilaPosicionPorJornada = {
  jornada: number;
  puntos: number;
  posicion: number;
  equipos: number;
};

/**
 * Puntos acumulados y puesto de un equipo al acabar cada jornada, calculados con los resultados del
 * grupo (mismo orden que la tabla calculada: puntos, diferencia de goles, goles a favor). No usa la
 * tabla oficial guardada, que puede ser de otra jornada.
 * Parámetros: (1) `core.team_entry.id`.
 */
export const POSICION_POR_JORNADA: Consulta<FilaPosicionPorJornada> = {
  nombre: 'posicion-por-jornada',
  descripcion: 'Puntos acumulados y puesto de un equipo al final de cada jornada jugada de su grupo.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: ['jornada', 'puntos', 'posicion', 'equipos'],
  sql: `
    with lados as (
      select d.numero as j, m.home_team_entry_id as te,
             case when m.goles_local > m.goles_visitante then 3 when m.goles_local = m.goles_visitante then 1 else 0 end as pts,
             m.goles_local as gf, m.goles_visitante as gc
        from core.match m join core.matchday d on d.id = m.matchday_id
       where m.phase_group_id = (select phase_group_id from core.team_entry where id = $1)
         and m.goles_local is not null and m.goles_visitante is not null
      union all
      select d.numero, m.away_team_entry_id,
             case when m.goles_visitante > m.goles_local then 3 when m.goles_local = m.goles_visitante then 1 else 0 end,
             m.goles_visitante, m.goles_local
        from core.match m join core.matchday d on d.id = m.matchday_id
       where m.phase_group_id = (select phase_group_id from core.team_entry where id = $1)
         and m.goles_local is not null and m.goles_visitante is not null
    ),
    jornadas as (select distinct j from lados),
    equipos as (select distinct te from lados),
    acumulado as (
      select e.te, jn.j,
             coalesce(sum(l.pts), 0) as pts,
             coalesce(sum(l.gf - l.gc), 0) as dg,
             coalesce(sum(l.gf), 0) as gf
        from equipos e
        cross join jornadas jn
        left join lados l on l.te = e.te and l.j <= jn.j
       group by e.te, jn.j
    ),
    orden as (
      select te, j, pts, rank() over (partition by j order by pts desc, dg desc, gf desc) as pos
        from acumulado
    )
    select o.j::int as jornada, o.pts::int as puntos, o.pos::int as posicion,
           (select count(*) from equipos)::int as equipos
      from orden o
     where o.te = $1
     order by o.j
     limit 80`,
};

export type FilaContextoDePrevia = {
  grupo_id: number;
  campo_id: number | null;
  /** Últimos cinco resultados en el grupo, del más antiguo al más reciente: `G`, `E`, `P`. Vacío si no ha jugado. */
  forma_local: string;
  forma_visitante: string;
};

/**
 * Lo que la previa necesita además de su consulta principal: el grupo (para la tabla), el campo (para
 * enlazarlo) y la forma de los dos equipos. Parámetros: (1) `core.match.id`.
 */
export const CONTEXTO_DE_PREVIA: Consulta<FilaContextoDePrevia> = {
  nombre: 'contexto-de-previa',
  descripcion: 'Grupo, campo y forma (últimos cinco resultados) de los dos equipos de un partido.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['grupo_id', 'campo_id', 'forma_local', 'forma_visitante'],
  sql: `
    select m.phase_group_id::int as grupo_id, m.venue_id::int as campo_id,
           coalesce((select string_agg(u.r, '' order by u.cuando, u.id)
                       from (select x.id, coalesce(x.played_at::date, x.fecha_prevista) as cuando,
                                    case when x.goles_local = x.goles_visitante then 'E'
                                         when (x.home_team_entry_id = m.home_team_entry_id) = (x.goles_local > x.goles_visitante) then 'G'
                                         else 'P' end as r
                               from core.match x
                              where x.phase_group_id = m.phase_group_id and x.id <> m.id
                                and (x.home_team_entry_id = m.home_team_entry_id or x.away_team_entry_id = m.home_team_entry_id)
                                and x.goles_local is not null and x.goles_visitante is not null
                              order by coalesce(x.played_at::date, x.fecha_prevista) desc nulls last, x.id desc
                              limit 5) u), '') as forma_local,
           coalesce((select string_agg(u.r, '' order by u.cuando, u.id)
                       from (select x.id, coalesce(x.played_at::date, x.fecha_prevista) as cuando,
                                    case when x.goles_local = x.goles_visitante then 'E'
                                         when (x.home_team_entry_id = m.away_team_entry_id) = (x.goles_local > x.goles_visitante) then 'G'
                                         else 'P' end as r
                               from core.match x
                              where x.phase_group_id = m.phase_group_id and x.id <> m.id
                                and (x.home_team_entry_id = m.away_team_entry_id or x.away_team_entry_id = m.away_team_entry_id)
                                and x.goles_local is not null and x.goles_visitante is not null
                              order by coalesce(x.played_at::date, x.fecha_prevista) desc nulls last, x.id desc
                              limit 5) u), '') as forma_visitante
      from core.match m
     where m.id = $1
     limit 1`,
};

export type FilaCruceDelGrupo = {
  jornada: number;
  orden: number;
  /** Fecha de la jornada en el calendario, `YYYY-MM-DD`, o `null` si no la publica. */
  fecha: string | null;
  local_id: number;
  visitante_id: number;
  local: string;
  visitante: string;
  goles_esperados_local: number | null;
  goles_esperados_visitante: number | null;
};

const CRUCE = `
           c.jornada::int as jornada, c.orden::int as orden,
           to_char(c.fecha_prevista, 'YYYY-MM-DD') as fecha,
           el.id::int as local_id, ev.id::int as visitante_id,
           el.nombre_en_fuente as local, ev.nombre_en_fuente as visitante,
           (l.media_local     * coalesce(fl.ataque, 1) * coalesce(fv.defensa, 1))::float8 as goles_esperados_local,
           (l.media_visitante * coalesce(fv.ataque, 1) * coalesce(fl.defensa, 1))::float8 as goles_esperados_visitante
      from core.calendario_pendiente c
      join core.phase_group g on g.id = c.phase_group_id
      join core.team_entry el on el.id = c.home_team_entry_id
      join core.team_entry ev on ev.id = c.away_team_entry_id
      left join analytics.poisson_liga l on l.competition_edition_id = g.competition_edition_id
      left join analytics.poisson_equipo fl on fl.competition_edition_id = g.competition_edition_id and fl.team_season_id = el.team_season_id
      left join analytics.poisson_equipo fv on fv.competition_edition_id = g.competition_edition_id and fv.team_season_id = ev.team_season_id`;

const COLUMNAS_CRUCE = ['jornada', 'orden', 'fecha', 'local_id', 'visitante_id', 'local', 'visitante',
  'goles_esperados_local', 'goles_esperados_visitante'] as const;

/**
 * La próxima jornada de un grupo según el calendario previsto: la más baja que aún no tiene partidos y
 * cuya fecha es de hoy en adelante (o no tiene fecha). Parámetros: (1) `core.phase_group.id`.
 */
export const PROXIMA_JORNADA_DEL_GRUPO: Consulta<FilaCruceDelGrupo> = {
  nombre: 'proxima-jornada-del-grupo',
  descripcion: 'Cruces de la próxima jornada de un grupo según el calendario previsto, con sus goles esperados.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: COLUMNAS_CRUCE,
  sql: `
    select ${CRUCE}
     where c.phase_group_id = $1
       and c.jornada = (select min(p.jornada) from core.calendario_pendiente p
                         where p.phase_group_id = $1
                           and (p.fecha_prevista is null
                                or p.fecha_prevista >= (now() at time zone 'Europe/Madrid')::date))
     order by c.orden
     limit 40`,
};

/**
 * Los próximos cruces de un equipo según el calendario previsto, por jornada.
 * Parámetros: (1) `core.team_entry.id`, (2) límite.
 */
export const PROXIMOS_DEL_EQUIPO: Consulta<FilaCruceDelGrupo> = {
  nombre: 'proximos-del-equipo',
  descripcion: 'Próximos cruces de un equipo según el calendario previsto, con sus goles esperados.',
  plan: 'indexado',
  presupuestoMs: 400,
  columnas: COLUMNAS_CRUCE,
  sql: `
    select ${CRUCE}
     where (c.home_team_entry_id = $1 or c.away_team_entry_id = $1)
       and (c.fecha_prevista is null or c.fecha_prevista >= (now() at time zone 'Europe/Madrid')::date)
     order by c.jornada, c.orden
     limit $2`,
};
