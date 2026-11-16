import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';
import { TEMPORADA_MINIMA } from '@/lib/temporadas';

/**
 * Consultas de las páginas de estadísticas (WALL objetivo 5).
 *
 * Tres reglas del proyecto se ven en el SQL:
 *  · una consulta por bloque, sin N+1: el resumen, los goles por tramo y las tarjetas de una página se
 *    resuelven en UNA consulta con JSON; los goleadores en otra;
 *  · ningún valor se interpola y todo lleva `LIMIT`;
 *  · sólo se recorren tablas de hechos con federación/temporada o grupo delante: nunca un
 *    `count(*)` global de partidos o eventos.
 *
 * Los agregados se hacen en PostgreSQL y no en la página para no traer miles de filas: la página de una
 * federación puede tener miles de partidos y cientos de miles de eventos.
 */

/** Los totales de partidos de un ámbito (federación+temporada o competición). */
export type ResumenDePartidos = {
  partidos: number;
  con_resultado: number;
  goles: number;
  /** Partidos ganados por el local, empatados y ganados por el visitante (sólo con resultado). */
  local: number;
  empate: number;
  visitante: number;
  /** Partidos con resultado en los que algún equipo se quedó a cero. */
  con_cero: number;
  /** Partidos con acta analizada y cuántos de ellos con acta correcta. */
  actas: number;
  actas_correctas: number;
};

/** Goles y partidos de un mes del calendario (`AAAA-MM`). */
export type GolesPorMes = { mes: string; partidos: number; goles: number };

/** Goles de un tramo de quince minutos. `orden` 6 = 90+, 99 = sin minuto. */
export type TramoDeGoles = { orden: number; goles: number };

/** Tarjetas de un equipo del ámbito. */
export type TarjetasDeEquipo = { equipo_id: number; equipo: string; amarillas: number; rojas: number };

/** Lo que devuelve el resumen de un ámbito, ya agregado. */
export type ResumenEstadisticas = {
  resumen: ResumenDePartidos;
  /** Goles por mes del calendario: los partidos de una federación se juegan en meses distintos. */
  por_mes: GolesPorMes[];
  tramos: TramoDeGoles[];
  tarjetas: TarjetasDeEquipo[];
};

/** Fila única con el JSON del resumen. */
export type FilaResumenEstadisticas = { datos: ResumenEstadisticas | null };

/**
 * Resumen de una federación y temporada: resultados, goles por mes, goles por tramo y tarjetas por
 * equipo, en una sola pasada sobre los partidos de ese ámbito.
 *
 * Parámetros: (1) federación, (2) temporada.
 *
 * El `join` de `team_entry` para poner nombre al equipo de las tarjetas se hace con una subconsulta
 * correlacionada: con un JOIN normal, el planificador elegía un `Seq Scan` a `core.team_entry` entero
 * (402.000 filas) para contar las tarjetas de 27.000 eventos (medido el 05/11/2026).
 */
export const RESUMEN_DE_ESTADISTICAS: Consulta<FilaResumenEstadisticas> = {
  nombre: 'resumen-de-estadísticas',
  descripcion: 'Resumen de una federación y temporada: partidos, resultados, goles por mes, goles por tramo de quince minutos y tarjetas por equipo.',
  plan: 'indexado',
  presupuestoMs: 1_200,
  columnas: ['datos'],
  sql: `
    with partidos as materialized (
      select m.id, m.goles_local, m.goles_visitante, m.played_at, m.fecha_prevista,
             m.matchday_id, r.quality
        from core.match m
        join core.phase_group g on g.id = m.phase_group_id
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        join core.season s on s.id = e.season_id
        left join core.match_report r on r.match_id = m.id
       where ($1::text is null or f.codigo = $1)
         and ($2::text is null or s.etiqueta = $2)
    ),
    eventos as materialized (
      select e.event_type, e.minute_base, e.team_entry_id
        from core.match_event e
        join partidos p on p.id = e.match_id
       where e.event_type in ('gol', 'tarjeta_amarilla', 'tarjeta_roja', 'tarjeta_roja_directa')
    ),
    resumen as (
      select count(*)::int as partidos,
             count(*) filter (where goles_local is not null)::int as con_resultado,
             coalesce(sum(goles_local + goles_visitante), 0)::int as goles,
             count(*) filter (where goles_local > goles_visitante)::int as local,
             count(*) filter (where goles_local = goles_visitante and goles_local is not null)::int as empate,
             count(*) filter (where goles_local < goles_visitante)::int as visitante,
             count(*) filter (where goles_local is not null and (goles_local = 0 or goles_visitante = 0))::int as con_cero,
             count(*) filter (where quality is not null)::int as actas,
             count(*) filter (where quality = 'correct')::int as actas_correctas
        from partidos
    ),
    por_mes as (
      select to_char(coalesce((p.played_at at time zone 'UTC')::date, p.fecha_prevista), 'YYYY-MM') as mes,
             count(*)::int as partidos,
             coalesce(sum(p.goles_local + p.goles_visitante), 0)::int as goles
        from partidos p
       where coalesce((p.played_at at time zone 'UTC')::date, p.fecha_prevista) is not null
       group by 1
       order by 1
    ),
    tramos as (
      select case when minute_base is null then 99 else least(minute_base / 15, 6) end as orden,
             count(*)::int as goles
        from eventos
       where event_type = 'gol'
       group by 1
       order by 1
    ),
    tarjetas as (
      select e.team_entry_id,
             (select te.nombre_en_fuente from core.team_entry te where te.id = e.team_entry_id) as equipo,
             count(*) filter (where e.event_type = 'tarjeta_amarilla')::int as amarillas,
             count(*) filter (where e.event_type in ('tarjeta_roja', 'tarjeta_roja_directa'))::int as rojas
        from eventos e
       where e.event_type like 'tarjeta%'
       group by e.team_entry_id
       order by (count(*) filter (where e.event_type = 'tarjeta_amarilla')
                 + count(*) filter (where e.event_type in ('tarjeta_roja', 'tarjeta_roja_directa'))) desc,
                e.team_entry_id
       limit 12
    )
    select jsonb_build_object(
      'resumen', (select to_jsonb(r) from resumen r),
      'por_mes', (select coalesce(jsonb_agg(jsonb_build_object(
                        'mes', mes, 'partidos', partidos, 'goles', goles) order by mes), '[]'::jsonb)
                       from por_mes),
      'tramos', (select coalesce(jsonb_agg(jsonb_build_object('orden', orden, 'goles', goles) order by orden), '[]'::jsonb)
                   from tramos),
      'tarjetas', (select coalesce(jsonb_agg(jsonb_build_object(
                     'equipo_id', team_entry_id, 'equipo', equipo,
                     'amarillas', amarillas, 'rojas', rojas)), '[]'::jsonb)
                     from tarjetas)
    ) as datos
  `,
};

/** Goles por tramo y tarjetas de un grupo, en una consulta. */
export type EventosDelGrupo = { tramos: TramoDeGoles[]; tarjetas: TarjetasDeEquipo[] };

/** Fila única con los eventos agregados de un grupo. */
export type FilaEventosDelGrupo = { datos: EventosDelGrupo | null };

/**
 * Goles por tramo y tarjetas por equipo de un grupo, con una sola consulta. Parámetros: (1) grupo.
 *
 * No incluye el resumen de partidos ni los puntos por jornada: eso se calcula en la página con los
 * partidos del grupo, que ya se piden para el calendario y las cuentas.
 */
export const EVENTOS_DEL_GRUPO: Consulta<FilaEventosDelGrupo> = {
  nombre: 'eventos-del-grupo',
  descripcion: 'Goles por tramo de quince minutos y tarjetas por equipo de un grupo, contados desde las actas.',
  plan: 'indexado',
  presupuestoMs: 300,
  columnas: ['datos'],
  sql: `
    with eventos as materialized (
      select e.event_type, e.minute_base, e.team_entry_id
        from core.match_event e
        join core.match m on m.id = e.match_id
       where m.phase_group_id = $1
         and e.event_type in ('gol', 'tarjeta_amarilla', 'tarjeta_roja', 'tarjeta_roja_directa')
    ),
    tramos as (
      select case when minute_base is null then 99 else least(minute_base / 15, 6) end as orden,
             count(*)::int as goles
        from eventos
       where event_type = 'gol'
       group by 1
       order by 1
    ),
    tarjetas as (
      select e.team_entry_id,
             (select te.nombre_en_fuente from core.team_entry te where te.id = e.team_entry_id) as equipo,
             count(*) filter (where e.event_type = 'tarjeta_amarilla')::int as amarillas,
             count(*) filter (where e.event_type in ('tarjeta_roja', 'tarjeta_roja_directa'))::int as rojas
        from eventos e
       where e.event_type like 'tarjeta%'
       group by e.team_entry_id
       order by (count(*) filter (where e.event_type = 'tarjeta_amarilla')
                 + count(*) filter (where e.event_type in ('tarjeta_roja', 'tarjeta_roja_directa'))) desc,
                e.team_entry_id
       limit 24
    )
    select jsonb_build_object(
      'tramos', (select coalesce(jsonb_agg(jsonb_build_object('orden', orden, 'goles', goles) order by orden), '[]'::jsonb)
                   from tramos),
      'tarjetas', (select coalesce(jsonb_agg(jsonb_build_object(
                     'equipo_id', team_entry_id, 'equipo', equipo,
                     'amarillas', amarillas, 'rojas', rojas)), '[]'::jsonb)
                     from tarjetas)
    ) as datos
  `,
};

/** Un goleador del ámbito, con su equipo y su escudo. */
export type FilaGoleadorEstadisticas = {
  persona_id: number;
  nombre: string | null;
  es_menor: boolean;
  goles: number;
  goles_penalti: number;
  partidos: number;
  equipo: string;
  club_id: number | null;
  tiene_escudo: boolean | null;
};

/**
 * Máximos goleadores de una federación y temporada (o de un grupo). Parámetros:
 * (1) federación, (2) temporada, (3) grupo o null, (4) mínimo de partidos, (5) límite.
 *
 * Usa la tabla agregada de jugador-temporada y hace el top-N ANTES de resolver nombre y equipo: la
 * consulta de ranking general tarda ~600 ms porque arrastra más joins; ésta, medida el 05/11/2026, 74 ms.
 */
export const GOLEADORES_DE_ESTADISTICAS: Consulta<FilaGoleadorEstadisticas> = {
  nombre: 'goleadores-de-estadísticas',
  descripcion: 'Máximos goleadores de una federación y temporada o de un grupo, con su equipo, su club y si el club tiene escudo.',
  plan: 'indexado',
  presupuestoMs: 500,
  columnas: ['persona_id', 'nombre', 'es_menor', 'goles', 'goles_penalti', 'partidos', 'equipo', 'club_id', 'tiene_escudo'],
  sql: `
    with top as (
      select s.person_id, s.team_entry_id, s.goles, s.goles_penalti, s.partidos_demostrados
        from analytics.player_team_season_summary s
        join core.competition_edition ce on ce.id = s.competition_edition_id
        join core.federation f on f.id = ce.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        join core.season se on se.id = ce.season_id
       where s.goles > 0
         and s.partidos_demostrados >= $4
         and ($1::text is null or f.codigo = $1)
         and ($2::text is null or se.etiqueta = $2)
         and ($3::bigint is null
              or exists (select 1 from core.team_entry te3
                          where te3.id = s.team_entry_id and te3.phase_group_id = $3))
       order by s.goles desc, s.partidos_demostrados asc, s.person_id
       limit $5
    )
    select t.person_id::int as persona_id,
           p.nombre_mostrado as nombre,
           p.es_menor,
           t.goles::int,
           t.goles_penalti::int,
           t.partidos_demostrados::int as partidos,
           ts.nombre as equipo,
           ts.club_id::int as club_id,
           exists (select 1 from core.club_asset ca
                    where ca.club_id = ts.club_id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo
      from top t
      join core.person p on p.id = t.person_id
      join core.team_entry te on te.id = t.team_entry_id
      join core.team_season ts on ts.id = te.team_season_id
     order by t.goles desc, t.partidos_demostrados asc, p.nombre_mostrado
     limit $5
  `,
};

/** Las opciones de los filtros: federaciones con datos y temporadas publicadas, en una consulta. */
export type FilaOpcionesEstadisticas = {
  federaciones: Array<{ codigo: string; nombre: string; nombre_corto: string | null }> | null;
  temporadas: Array<{ etiqueta: string; orden: number }> | null;
};

export const OPCIONES_DE_ESTADISTICAS: Consulta<FilaOpcionesEstadisticas> = {
  nombre: 'opciones-de-estadísticas',
  descripcion: 'Federaciones con datos importados y temporadas publicadas, para los filtros de las páginas de estadísticas.',
  plan: 'agregado',
  presupuestoMs: 400,
  columnas: ['federaciones', 'temporadas'],
  sql: `
    select (select jsonb_agg(jsonb_build_object('codigo', f.codigo, 'nombre', f.nombre,
                                                'nombre_corto', fp.nombre_corto)
                             order by coalesce(fp.nombre_corto, f.nombre))
              from core.federation f
              left join core.federacion_perfil fp on fp.codigo = f.codigo
             where ${SQL_FEDERACION_NO_EXCLUIDA}
               and exists (select 1 from core.competition_edition e where e.federation_id = f.id)) as federaciones,
           (select jsonb_agg(jsonb_build_object('etiqueta', s.etiqueta, 'orden', s.orden) order by s.orden desc)
              from core.season s
             where s.etiqueta >= '${TEMPORADA_MINIMA}'
               and exists (select 1 from core.competition_edition e where e.season_id = s.id)) as temporadas
     limit 1`,
};

export const CONSULTAS_ESTADISTICAS = [RESUMEN_DE_ESTADISTICAS, EVENTOS_DEL_GRUPO, GOLEADORES_DE_ESTADISTICAS,
  OPCIONES_DE_ESTADISTICAS] as const;

/** Parámetros de ejemplo: los usan la prueba de contrato y la medición. */
/**
 * Las dos consultas globales, acotadas a UNA categoría. La página general no enseña nunca un ranking
 * que mezcle categorías: un alevín con 38 goles no va delante del máximo goleador de Tercera.
 *
 * Se derivan del texto de las consultas de arriba añadiendo una condición, para no mantener dos copias
 * de ochenta líneas. `test/estadisticas-categoria.test.ts` comprueba que la condición está puesta.
 *
 * Parámetros de `RESUMEN_POR_CATEGORIA`: (1) federación, (2) temporada, (3) categoría.
 * Parámetros de `GOLEADORES_POR_CATEGORIA`: los cinco de `goleadores-de-estadísticas` y (6) categoría.
 */
export const RESUMEN_POR_CATEGORIA: Consulta<{ datos: ResumenEstadisticas | null }> = {
  ...RESUMEN_DE_ESTADISTICAS,
  nombre: 'resumen-por-categoría',
  descripcion: 'Resumen de estadísticas de una federación y temporada, acotado a una categoría.',
  sql: RESUMEN_DE_ESTADISTICAS.sql.replace(
    'and ($2::text is null or s.etiqueta = $2)',
    'and ($2::text is null or s.etiqueta = $2)\n         and e.categoria = $3::text'),
};

export const GOLEADORES_POR_CATEGORIA: Consulta<FilaGoleadorEstadisticas> = {
  ...GOLEADORES_DE_ESTADISTICAS,
  nombre: 'goleadores-por-categoría',
  descripcion: 'Máximos goleadores de una federación y temporada, acotados a una categoría.',
  sql: GOLEADORES_DE_ESTADISTICAS.sql.replace(
    'and ($2::text is null or se.etiqueta = $2)',
    'and ($2::text is null or se.etiqueta = $2)\n         and ce.categoria = $6::text'),
};

export const PARAMETROS_ESTADISTICAS: Record<string, readonly unknown[]> = {
  'resumen-de-estadísticas': ['castilla-leon', '2026-27'],
  'eventos-del-grupo': [3769],
  'goleadores-de-estadísticas': ['castilla-leon', '2026-27', null, 1, 10],
  'opciones-de-estadísticas': [],
};
