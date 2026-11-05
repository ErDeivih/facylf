import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas de las pantallas de Rankings y Ojeo.
 *
 * Las dos pantallas comparten la misma idea: una federación y una temporada por defecto (Castilla y
 * León, la más reciente), filtros explícitos y un límite que se dice. Ninguna consulta toca tablas de
 * hechos: leen los resúmenes por jugador-temporada (`analytics.player_team_season_summary`) y el
 * buscador de talento proyectado (`analytics.ojeo_jugador`).
 *
 * Reglas de la casa que se ven en el SQL:
 *  · **`LIMIT` explícito y parámetros numerados**; un filtro opcional va como `$n is null or …`.
 *  · **Lo que no está medido es `null`, no `0`**: minutos y min/gol pueden faltar y la pantalla lo dice.
 *  · **Los nombres de menores se publican** (decisión de David del 05/11/2026): ni esta consulta ni la
 *    de ojeo ocultan nombres. En ojeo el parámetro de permiso que sigue teniendo la consulta existente
 *    se pasa en `true` desde la pantalla, y así se explica en `lib/rankings.ts`.
 *  · **El total es honesto**: en rankings es el `count(*) over ()` de los que cumplen los filtros (para
 *    paginar); en ojeo se lee el total ya acotado de la consulta (1.001 = «más de 1.000»).
 */

/** Una fila del ranking: el jugador, su equipo y su competición, con la métrica que se ordena. */
export type FilaRankingJugador = {
  posicion: number;
  persona_id: number;
  nombre: string;
  es_menor: boolean;
  equipo_id: number;
  equipo: string;
  club_id: number;
  tiene_escudo: boolean | null;
  federacion: string;
  federacion_nombre: string;
  federacion_corta: string | null;
  edicion_id: number;
  edicion: string;
  division: string | null;
  categoria: string | null;
  grupo_id: number;
  grupo: string;
  goles: number;
  goles_penalti: number;
  partidos: number;
  minutos_exactos: number | null;
  minutos_estimados: number | null;
  minutos_fiables: boolean;
  goles_por_partido: number | null;
  minutos_por_gol: number | null;
  amarillas: number;
  rojas: number;
  dobles_amarillas: number;
  partidos_sancion: number;
  total: number;
};

/**
 * Ranking de jugadores (goleadores o tarjetas) de una federación y temporada, con filtros de
 * competición y grupo y paginación por desplazamiento.
 *
 * Parámetros: (1) federación|null, (2) temporada `AAAA-AA`, (3) tipo (`goles`|`tarjetas`),
 * (4) edición|null, (5) grupo|null, (6) mínimo de partidos, (7) límite, (8) desplazamiento.
 *
 * El orden lo fija la métrica del tipo; el `rank()` se calcula sobre TODO el conjunto filtrado, así que
 * la posición de la página 2 continúa la de la 1 (no se reinicia).
 */
export const RANKING_DE_JUGADORES: Consulta<FilaRankingJugador> = {
  nombre: 'ranking-de-jugadores',
  descripcion: 'Goleadores o tarjetas de una federación y temporada, filtrables por competición y grupo, con la posición, el equipo y la cobertura de minutos.',
  plan: 'indexado',
  // Medido el 05/11/2026 contra el canónico con CyL: 7–19 ms con el mínimo por defecto de 5 partidos
  // (el conjunto baja a decenas de filas), y 182–195 ms con mínimo 0 (41.000 resúmenes ordenados).
  presupuestoMs: 800,
  columnas: ['posicion', 'persona_id', 'nombre', 'es_menor', 'equipo_id', 'equipo', 'club_id',
    'tiene_escudo', 'federacion', 'federacion_nombre', 'federacion_corta', 'edicion_id', 'edicion',
    'division', 'categoria', 'grupo_id', 'grupo', 'goles', 'goles_penalti', 'partidos',
    'minutos_exactos', 'minutos_estimados', 'minutos_fiables', 'goles_por_partido', 'minutos_por_gol',
    'amarillas', 'rojas', 'dobles_amarillas', 'partidos_sancion', 'total'],
  sql: `
    with base as materialized (
      select (rank() over (order by case when $3 = 'tarjetas' then s.amarillas else s.goles end desc,
                                   s.partidos_demostrados asc, p.nombre_mostrado))::int as posicion,
             s.person_id::int            as persona_id,
             p.nombre_mostrado           as nombre,
             p.es_menor,
             te.id::int                  as equipo_id,
             ts.nombre                   as equipo,
             ts.club_id::int             as club_id,
             f.codigo                    as federacion,
             f.nombre                    as federacion_nombre,
             fp.nombre_corto             as federacion_corta,
             e.id::int                   as edicion_id,
             e.nombre_publicado          as edicion,
             e.division,
             e.categoria,
             g.id::int                   as grupo_id,
             g.nombre                    as grupo,
             s.goles,
             s.goles_penalti,
             s.partidos_demostrados      as partidos,
             s.minutos_exactos,
             s.minutos_estimados,
             s.minutos_fiables,
             round(s.goles::numeric / nullif(s.partidos_demostrados, 0), 2)::float8 as goles_por_partido,
             case when s.minutos_fiables and s.goles > 0
                  then round(s.minutos_exactos::numeric / s.goles)::int end as minutos_por_gol,
             s.amarillas,
             s.rojas,
             s.dobles_amarillas,
             s.partidos_sancion,
             (count(*) over ())::int     as total
        from analytics.player_team_season_summary s
        join core.competition_edition e on e.id = s.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        left join core.federacion_perfil fp on fp.codigo = f.codigo
        join core.season se on se.id = e.season_id and se.etiqueta = $2
        join core.team_entry te on te.id = s.team_entry_id
        join core.team_season ts on ts.id = te.team_season_id
        join core.phase_group g on g.id = te.phase_group_id
        join core.person p on p.id = s.person_id
       where ($1::text is null or f.codigo = $1)
         and ($4::bigint is null or e.id = $4)
         and ($5::bigint is null or g.id = $5)
         and e.ambito <> 'copa'
         and (case when $3 = 'tarjetas' then s.amarillas else s.goles end) > 0
         and s.partidos_demostrados >= $6
    )
    select b.*,
           exists (select 1 from core.club_asset ca
                    where ca.club_id = b.club_id and ca.tipo = 'escudo' and ca.vigente) as tiene_escudo
      from base b
     order by b.posicion
     limit $7 offset $8`,
};

/** Una competición (edición) de la federación y temporada pedidas, con cuántos grupos tiene. */
export type FilaEdicionRanking = {
  edicion_id: number;
  edicion: string;
  categoria: string | null;
  division: string | null;
  ambito: string | null;
  grupos: number;
};

/**
 * Competiciones de una federación y temporada para el desplegable «Competición».
 *
 * Parámetros: (1) federación|null, (2) temporada.
 *
 * Se ofrecen sólo las que existen en el catálogo y no son copa (un ranking de goleadores de una copa
 * tendría muy pocos partidos y confundiría). Sin filas, el desplegable no se rellena: no se inventan
 * competiciones.
 */
export const EDICIONES_DEL_RANKING: Consulta<FilaEdicionRanking> = {
  nombre: 'ediciones-del-ranking',
  descripcion: 'Competiciones (ediciones) de una federación y temporada con su categoría, división y número de grupos, para el filtro del ranking.',
  plan: 'indexado',
  // Medido: 0,8 ms con CyL 2026-27 (catálogo acotado por federación y temporada).
  presupuestoMs: 300,
  columnas: ['edicion_id', 'edicion', 'categoria', 'division', 'ambito', 'grupos'],
  sql: `
    select e.id::int               as edicion_id,
           e.nombre_publicado      as edicion,
           e.categoria,
           e.division,
           e.ambito,
           count(g.id)::int        as grupos
      from core.competition_edition e
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id and s.etiqueta = $2
      left join core.phase_group g on g.competition_edition_id = e.id
     where ($1::text is null or f.codigo = $1)
       and e.ambito <> 'copa'
     group by e.id, e.nombre_publicado, e.categoria, e.division, e.ambito
     order by e.nombre_publicado
     limit 200`,
};

/** Una categoría que tiene datos de ojeo en una temporada. */
export type FilaCategoriaOjeo = { categoria: string };

/**
 * Categorías de una temporada en el buscador de talento, para el desplegable «Categoría».
 *
 * Parámetros: (1) temporada `AAAA-AA`.
 *
 * No es una lista escrita a mano: son las categorías que existen en los datos de esa temporada. Se
 * ordenan y se limitan; no se cuentan filas (contar 300.000 sería tirar tiempo para nada).
 */
export const CATEGORIAS_DEL_OJEO: Consulta<FilaCategoriaOjeo> = {
  nombre: 'categorias-del-ojeo',
  descripcion: 'Categorías con datos de ojeo en una temporada, para el filtro de categoría.',
  plan: 'indexado',
  // Medido: 38 ms con 2026-27 (recorrido de índice por temporada y categoría).
  presupuestoMs: 300,
  columnas: ['categoria'],
  sql: `
    select distinct categoria
      from analytics.ojeo_jugador
     where season_id = (select id from core.season where etiqueta = $1)
       and categoria is not null
       and categoria <> ''
     order by categoria
     limit 30`,
};

/** Parámetros de ejemplo: los usan las pruebas de contrato y la medición de planes. */
export const PARAMETROS_RANKINGS: Record<string, readonly unknown[]> = {
  'ranking-de-jugadores': [null, '2026-27', 'goles', null, null, 0, 25, 0],
  'ediciones-del-ranking': [null, '2026-27'],
  'categorias-del-ojeo': ['2026-27'],
};

/** Las consultas de estas pantallas, para las pruebas de contrato. */
export const CONSULTAS_RANKINGS = [RANKING_DE_JUGADORES, EDICIONES_DEL_RANKING, CATEGORIAS_DEL_OJEO] as const;
