import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas de la migración 0029: buscador de talento (ojeo), desglose de minutos por equipo, sanciones
 * inferidas, árbitros y uso de jugadores de equipos inferiores. Leen sólo `analytics` (proyectado).
 * Ver docs/plataforma-web/PLATAFORMA-NACIONAL.md §3.7-§3.10 y §6.3.
 *
 * Reglas comunes:
 *  · Los minutos son el dato principal. `minutos_exactos = false` → la cifra es una cota inferior y la
 *    pantalla la marca con «≥».
 *  · Menores: si quien consulta no tiene `ver_menores_nombres`, el último parámetro es false y el nombre
 *    sale NULL (la pantalla pone «Jugador menor · dorsal y equipo»). Nunca se filtra por nombre de menor.
 */

export type FilaOjeo = {
  posicion: number; grupo_persona_id: number; persona_id: number; nombre: string | null; es_menor: boolean;
  federaciones: string[]; club_id: number | null; club: string | null; equipo: string | null; categoria: string | null;
  mejor_escalon: number | null; nacimiento_desde: number | null; nacimiento_hasta: number | null;
  minutos: number | null; minutos_exactos: boolean; pct_minutos: number | null; minutos_por_encima: number;
  partidos: number; titularidades: number; goles: number; goles_por_90: number | null; expulsiones: number;
  es_portero: boolean; linea: string | null; posicion_campo: string | null; por_encima_de_su_edad: boolean;
  temporadas_previas_alto_nivel: number; edad_incoherente: boolean;
  p_minutos: number; p_pct: number; p_nivel: number; p_encima: number; p_continuidad: number; p_goles: number;
  puntuacion: number; total: number;
};

/**
 * Buscador de talento. «Los mejores sub-19 de Castilla y León»: federación 'castilla-leon', temporada
 * '2025-26', nacidos 2007-2009. La puntuación (0-100) es la media ponderada de percentiles DENTRO del grupo
 * filtrado:
 *   minutos 30 % · % de minutos de su equipo 15 % · nivel (escalón) 20 % · minutos por encima (A siendo del B,
 *   juvenil siendo cadete) 10 % · temporadas previas en nivel alto 10 % · goles por 90 10 % (porteros:
 *   titularidades) · expulsiones −5 %.
 * Es ORIENTATIVA y se enseña con sus componentes; nunca sola. Si su competición no apunta cambios (0032), el
 * jugador no tiene minutos: se compara por titularidades con los que tampoco los tienen, y la pantalla lo dice.
 * Parámetros: (1) federación|null, (2) temporada, (3) nacido desde|null, (4) nacido hasta|null,
 * (5) categoría|null, (6) escalón máximo|null (1 = sólo lo más alto), (7) minutos mínimos, (8) sólo porteros
 * true|false|null, (9) línea POR|DEF|MED|DEL|null (sólo donde la federación la publica), (10) sólo «por encima
 * de su edad» true|null, (11) provincia|null, (12) límite, (13) puede ver nombres de menores.
 */
export const OJEO_JUGADORES: Consulta<FilaOjeo> = {
  nombre: 'ojeo-jugadores',
  descripcion: 'Buscador de talento por edad, nivel, minutos y continuidad, en una federación o en todas.',
  plan: 'indexado',
  presupuestoMs: 800,
  columnas: ['posicion', 'grupo_persona_id', 'persona_id', 'nombre', 'es_menor', 'federaciones', 'club_id', 'club',
    'equipo', 'categoria', 'mejor_escalon', 'nacimiento_desde', 'nacimiento_hasta', 'minutos', 'minutos_exactos',
    'pct_minutos', 'minutos_por_encima', 'partidos', 'titularidades', 'goles', 'goles_por_90', 'expulsiones',
    'es_portero', 'linea', 'posicion_campo', 'por_encima_de_su_edad', 'temporadas_previas_alto_nivel',
    'edad_incoherente', 'p_minutos', 'p_pct', 'p_nivel', 'p_encima', 'p_continuidad', 'p_goles', 'puntuacion', 'total'],
  sql: `
    -- 0036: la puntuación y los percentiles vienen precalculados frente a su quinta en toda España
    -- (analytics.puntua_ojeo). Aquí sólo se filtra y se lee en orden: con un filtro amplio el índice
    -- (season_id, puntuacion desc) entrega los primeros sin ordenar a nadie.
    with base as (
      select o.*
        from analytics.ojeo_jugador o
       where o.season_id = (select id from core.season where etiqueta = $2)
         and ($1::text is null or o.federaciones && (select coalesce(array_agg(f.id), '{}') from core.federation f
                                                       where f.codigo = $1 and (${SQL_FEDERACION_NO_EXCLUIDA})))
         and ($3::int is null or o.nacimiento_hasta >= $3)
         and ($4::int is null or o.nacimiento_desde <= $4)
         and ($5::text is null or o.categoria = $5)
         and ($6::int is null or o.mejor_escalon <= $6)
         and (o.minutos >= $7 or (o.minutos is null and o.titularidades * 60 >= $7))   -- sin minutos: mínimo por titularidades
         and ($8::boolean is null or o.es_portero = $8)
         and ($9::text is null or o.linea = $9)
         and ($10::boolean is null or o.por_encima_de_su_edad = $10)
         and ($11::text is null or exists (select 1 from core.club c where c.id = o.club_id and c.provincia = $11))
    ),
    top as (
      select * from base order by puntuacion desc nulls last, minutos desc nulls last, grupo_id limit $12
    )
    select (row_number() over (order by x.puntuacion desc nulls last, x.minutos desc nulls last, x.grupo_id))::int as posicion,
           x.grupo_id as grupo_persona_id, x.person_id as persona_id,
           case when p.es_menor and not $13::boolean then null else p.nombre_mostrado end as nombre, p.es_menor,
           (select array_agg(f.codigo order by f.codigo) from core.federation f where f.id = any(x.federaciones)) as federaciones,
           x.club_id, c.nombre_canonico as club, ts.nombre as equipo, x.categoria,
           x.mejor_escalon, x.nacimiento_desde, x.nacimiento_hasta, x.minutos, x.minutos_exactos,
           x.pct_minutos::float8, x.minutos_por_encima, x.partidos, x.titularidades, x.goles,
           (case when x.minutos > 0 then round(90.0 * x.goles / x.minutos, 2) end)::float8 as goles_por_90,
           x.expulsiones, x.es_portero, x.linea, x.posicion as posicion_campo, x.por_encima_de_su_edad,
           x.temporadas_previas_alto_nivel::int, coalesce(x.edad_incoherente, false) as edad_incoherente,
           x.p_minutos::int, x.p_pct::int, x.p_nivel::int, x.p_encima::int, x.p_continuidad::int, x.p_goles::int,
           round(x.puntuacion)::int as puntuacion,
           -- total acotado: contar cientos de miles de filas para enseñar «más de 1.000» no vale la pena
           (select count(*) from (select 1 from base limit 1001) z)::int as total
      from top x
      join core.person p on p.id = x.person_id
      left join core.club c on c.id = x.club_id
      left join core.team_season ts on ts.id = x.team_season_id
     order by posicion`,
};

export type FilaMinutosEquipo = {
  temporada: string; anio: number; team_entry_id: number; equipo: string; club_id: number; club: string;
  competicion: string; categoria: string; division: string; escalon: number | null; tipo_grupo: string;
  papel: 'principal' | 'superior' | 'inferior' | 'otro_club'; partidos: number; titularidades: number;
  minutos: number | null; minutos_exactos: boolean; minutos_posibles: number | null; pct_minutos: number | null;
  goles: number; amarillas: number; expulsiones: number; partidos_sancion: number | null;
  primera_fecha: string | null; ultima_fecha: string | null;
};

/**
 * Desglose de minutos de un jugador (todas sus fichas unificadas) por temporada y equipo, con el papel de
 * cada equipo respecto al de su ficha. Es lo que pinta la barra apilada de la ficha del jugador.
 * Parámetros: (1) grupo_persona_id (o person_id si no tiene grupo).
 */
export const MINUTOS_POR_EQUIPO: Consulta<FilaMinutosEquipo> = {
  nombre: 'minutos-por-equipo',
  descripcion: 'Minutos de un jugador por temporada y equipo, con el papel de cada equipo.',
  plan: 'indexado',
  presupuestoMs: 150,
  columnas: ['temporada', 'anio', 'team_entry_id', 'equipo', 'club_id', 'club', 'competicion', 'categoria',
    'division', 'escalon', 'tipo_grupo', 'papel', 'partidos', 'titularidades', 'minutos', 'minutos_exactos',
    'minutos_posibles', 'pct_minutos', 'goles', 'amarillas', 'expulsiones', 'partidos_sancion', 'primera_fecha',
    'ultima_fecha'],
  sql: `
    with personas as (
      select person_id from analytics.persona_grupo where grupo_id = $1
      union select $1::bigint
    )
    select se.etiqueta as temporada, m.anio, m.team_entry_id, m.equipo, m.club_id, m.club, m.competicion,
           m.categoria, m.division, m.escalon, m.tipo_grupo,
           case when m.team_season_id = j.team_season_principal then 'principal'
                when m.club_id <> j.club_principal_id then 'otro_club'
                when analytics.orden_categoria(m.categoria) > analytics.orden_categoria(j.categoria_principal) then 'superior'
                when analytics.orden_categoria(m.categoria) < analytics.orden_categoria(j.categoria_principal) then 'inferior'
                when m.letra < (select core.letra_de_equipo(ts.nombre) from core.team_season ts where ts.id = j.team_season_principal) then 'superior'
                else 'inferior' end as papel,
           m.partidos, m.titularidades, m.minutos_estimados as minutos, m.minutos_fiables as minutos_exactos,
           m.minutos_posibles, m.pct_minutos::float8, m.goles, m.amarillas, m.expulsiones, m.partidos_sancion,
           m.primera_fecha::text, m.ultima_fecha::text
      from analytics.minutos_por_equipo m
      join personas p on p.person_id = m.person_id
      join core.season se on se.id = m.season_id
      left join analytics.jugador_temporada j on j.person_id = m.person_id and j.season_id = m.season_id
     order by m.anio desc, (m.team_season_id = j.team_season_principal) desc, m.minutos_estimados desc nulls last`,
};

export type FilaSancion = {
  persona_id: number; nombre: string | null; es_menor: boolean; equipo: string; fecha: string; minuto: number | null;
  motivo: string; partidos_perdidos: number; cierre: string; jugo_con_otro_equipo: number; partido_id: number;
  rival: string | null; total: number;
};

/**
 * Expulsiones y ciclos de amarillas de una edición, con los partidos que el jugador no jugó después.
 * Parámetros: (1) competition_edition_id, (2) persona o null, (3) límite, (4) puede ver nombres de menores.
 */
export const SANCIONES_INFERIDAS: Consulta<FilaSancion> = {
  nombre: 'sanciones-inferidas',
  descripcion: 'Partidos sin jugar tras expulsión o ciclo de amarillas, por edición o jugador.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['persona_id', 'nombre', 'es_menor', 'equipo', 'fecha', 'minuto', 'motivo', 'partidos_perdidos', 'cierre',
    'jugo_con_otro_equipo', 'partido_id', 'rival', 'total'],
  sql: `
    select s.person_id as persona_id,
           case when p.es_menor and not $4::boolean then null else p.nombre_mostrado end as nombre, p.es_menor,
           ts.nombre as equipo, s.fecha::text, s.minuto, s.motivo, s.partidos_perdidos, s.cierre, s.jugo_con_otro_equipo,
           s.match_id as partido_id,
           (select ts2.nombre from core.match m join core.team_entry te2 on te2.id =
               case when m.home_team_entry_id = s.team_entry_id then m.away_team_entry_id else m.home_team_entry_id end
              join core.team_season ts2 on ts2.id = te2.team_season_id where m.id = s.match_id) as rival,
           (count(*) over ())::int as total
      from analytics.sancion_inferida s
      join core.person p on p.id = s.person_id
      join core.team_season ts on ts.id = s.team_season_id
     where s.competition_edition_id = $1 and ($2::bigint is null or s.person_id = $2)
     order by s.partidos_perdidos desc, s.fecha desc
     limit $3`,
};

export type FilaArbitro = {
  arbitro_id: number; nombre: string; temporada: string; competicion: string; competition_edition_id: number;
  categoria: string; escalon: number | null; partidos: number; partidos_con_acta: number;
  amarillas_por_partido: number | null; media_edicion_amarillas: number | null;
  expulsiones_por_partido: number | null; media_edicion_expulsiones: number | null; rojas_directas: number;
  expulsiones_tecnicos: number; penaltis_gol: number; pct_gana_local: number | null; total: number;
};

/**
 * Ficha de árbitro: cada competición que dirigió por temporada, comparada con la media de sus colegas en la
 * misma competición. Parámetros: (1) arbitro_id (o null) (2) competition_edition_id (o null), (3) límite.
 * Con (1) = ficha; con (2) = árbitros de una competición ordenados por partidos.
 */
export const ARBITROS: Consulta<FilaArbitro> = {
  nombre: 'arbitros',
  descripcion: 'Árbitros: tarjetas, expulsiones, penaltis y resultados frente a la media de la competición.',
  plan: 'indexado',
  presupuestoMs: 200,
  columnas: ['arbitro_id', 'nombre', 'temporada', 'competicion', 'competition_edition_id', 'categoria', 'escalon',
    'partidos', 'partidos_con_acta', 'amarillas_por_partido', 'media_edicion_amarillas', 'expulsiones_por_partido',
    'media_edicion_expulsiones', 'rojas_directas', 'expulsiones_tecnicos', 'penaltis_gol', 'pct_gana_local', 'total'],
  sql: `
    select a.arbitro_id, a.nombre, a.temporada, a.competicion, a.competition_edition_id, a.categoria, a.escalon,
           a.partidos, a.partidos_con_acta, a.amarillas_por_partido::float8, a.media_edicion_amarillas::float8,
           a.expulsiones_por_partido::float8, a.media_edicion_expulsiones::float8, a.rojas_directas,
           a.expulsiones_tecnicos, a.penaltis_gol, a.pct_gana_local::float8, (count(*) over ())::int as total
      from analytics.arbitro_comparado a
     where ($1::bigint is null or a.arbitro_id = $1)
       and ($2::bigint is null or a.competition_edition_id = $2)
     order by a.season_id desc, a.partidos desc
     limit $3`,
};

export type FilaCantera = {
  team_season_id: number; equipo: string; club_id: number; minutos_totales: number; minutos_de_abajo: number;
  pct_de_abajo: number | null; jugadores_de_abajo: number; total: number;
};

/**
 * Qué equipos de una competición dan más minutos a jugadores cuya ficha está en un equipo inferior de su club
 * (el B en el A, el cadete en el juvenil). Parámetros: (1) competition_edition_id, (2) límite.
 */
export const USO_DE_CANTERA: Consulta<FilaCantera> = {
  nombre: 'uso-de-cantera',
  descripcion: 'Minutos que cada equipo da a jugadores de sus equipos inferiores.',
  plan: 'agregado',
  presupuestoMs: 600,
  columnas: ['team_season_id', 'equipo', 'club_id', 'minutos_totales', 'minutos_de_abajo', 'pct_de_abajo',
    'jugadores_de_abajo', 'total'],
  sql: `
    with filas as (
      select m.team_season_id, m.equipo, m.club_id, m.person_id, coalesce(m.minutos_estimados, 0) as minutos,
             (j.team_season_principal is distinct from m.team_season_id and j.club_principal_id = m.club_id) as de_abajo
        from analytics.minutos_por_equipo m
        left join analytics.jugador_temporada j on j.person_id = m.person_id and j.season_id = m.season_id
       where m.competition_edition_id = $1
    )
    select team_season_id, min(equipo) as equipo, min(club_id) as club_id, sum(minutos)::int as minutos_totales,
           coalesce(sum(minutos) filter (where de_abajo), 0)::int as minutos_de_abajo,
           round(100.0 * coalesce(sum(minutos) filter (where de_abajo), 0) / nullif(sum(minutos), 0), 1)::float8 as pct_de_abajo,
           count(distinct person_id) filter (where de_abajo and minutos > 0)::int as jugadores_de_abajo,
           (count(*) over ())::int as total
      from filas group by team_season_id
     order by pct_de_abajo desc nulls last
     limit $2`,
};

export const PARAMETROS_OJEO: Record<string, readonly unknown[]> = {
  'ojeo-jugadores': ['castilla-leon', '2025-26', 2007, 2009, null, null, 270, null, null, null, null, 50, false],
  'minutos-por-equipo': [1],
  'sanciones-inferidas': [1, null, 50, false],
  'arbitros': [null, 1, 50],
  'uso-de-cantera': [1, 40],
};

export const CONSULTAS_OJEO = [OJEO_JUGADORES, MINUTOS_POR_EQUIPO, SANCIONES_INFERIDAS, ARBITROS, USO_DE_CANTERA] as const;
