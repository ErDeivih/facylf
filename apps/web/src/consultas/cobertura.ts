import type { Consulta, FilaFederacion, FilaGrupo, FilaResumen } from './contratos';

/**
 * Consultas de cobertura.
 *
 * Reglas de la casa (RENDIMIENTO-BUSQUEDA.md): toda consulta lleva `LIMIT`, ningún valor se
 * interpola en el texto —van todos por parámetros— y no se suman jornadas esperadas de grupos
 * distintos, porque ese número no significa nada.
 *
 * Lo que se enseña sale de `ops.coverage_checkpoint`, que el importador recalcula al cerrar cada
 * lote. La web **no** calcula completitud recorriendo partidos: eso sería una segunda verdad.
 */

/**
 * Recuento global del canónico. Es un recorrido caro a propósito (cuenta tablas de hechos enteras) y
 * por eso vive en el diagnóstico, no en una página pública: cuando el canónico tenga millones de
 * partidos habrá que sustituirlo por los agregados de `analytics.*`.
 */
export const RESUMEN_CANONICO: Consulta<FilaResumen> = {
  nombre: 'resumen-canónico',
  descripcion: 'Cuánto hay en el canónico: federaciones, ediciones, grupos, partidos, actas, participaciones, eventos y personas.',
  plan: 'agregado',
  presupuestoMs: 2000,
  columnas: ['federaciones', 'ediciones', 'grupos', 'partidos', 'informes', 'participaciones', 'eventos', 'personas', 'grupos_completos', 'calculado_en'],
  sql: `
    select
      (select count(distinct federation_id) from core.competition_edition)::int as federaciones,
      (select count(*) from core.competition_edition)::int as ediciones,
      (select count(*) from core.phase_group)::int as grupos,
      (select count(*) from core.match)::int as partidos,
      (select count(*) from core.match_report)::int as informes,
      (select count(*) from core.appearance)::int as participaciones,
      (select count(*) from core.match_event)::int as eventos,
      (select count(*) from core.person)::int as personas,
      (select count(*) from ops.coverage_checkpoint where visibility_state = 'completa')::int as grupos_completos,
      (select max(calculado_en) from ops.coverage_checkpoint) as calculado_en
    limit 1`,
};

/**
 * Cobertura por federación, agregada por grupo. `grupos_sin_cobertura` existe porque un grupo recién
 * creado todavía no tiene punto de control: contarlo como completo sería mentir.
 */
export const COBERTURA_POR_FEDERACION: Consulta<FilaFederacion> = {
  nombre: 'cobertura-por-federación',
  descripcion: 'Por federación: ediciones, grupos, partidos conocidos y con resultado, actas y en qué estado de visibilidad están los grupos.',
  plan: 'agregado',
  presupuestoMs: 800,
  columnas: ['codigo', 'nombre', 'temporadas', 'ediciones', 'grupos', 'partidos_conocidos', 'partidos_con_resultado',
    'actas_disponibles', 'actas_parseadas', 'grupos_completos', 'grupos_parciales', 'grupos_sin_cobertura', 'calculado_en'],
  sql: `
    select f.codigo,
           f.nombre,
           count(distinct e.season_id)::int                                  as temporadas,
           count(distinct e.id)::int                                         as ediciones,
           count(g.id)::int                                                  as grupos,
           coalesce(sum(c.partidos_conocidos), 0)::int                       as partidos_conocidos,
           coalesce(sum(c.partidos_con_resultado), 0)::int                   as partidos_con_resultado,
           coalesce(sum(c.actas_disponibles), 0)::int                        as actas_disponibles,
           coalesce(sum(c.actas_parseadas), 0)::int                          as actas_parseadas,
           count(*) filter (where c.visibility_state = 'completa')::int      as grupos_completos,
           count(*) filter (where c.visibility_state in ('parcial_privada', 'verificada_hasta_jornada'))::int as grupos_parciales,
           count(*) filter (where c.phase_group_id is null)::int             as grupos_sin_cobertura,
           max(c.calculado_en)                                               as calculado_en
      from core.federation f
      join core.competition_edition e on e.federation_id = f.id
      join core.phase_group g on g.competition_edition_id = e.id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     group by f.codigo, f.nombre
     order by f.codigo
     limit 100`,
};

/**
 * Cobertura grupo a grupo. `complete_through_matchday` es la jornada hasta la que el grupo está
 * completo: `null` significa «no se sabe», no «cero».
 */
export const COBERTURA_POR_GRUPO: Consulta<FilaGrupo> = {
  nombre: 'cobertura-por-grupo',
  descripcion: 'Un renglón por grupo con su cobertura medida: jornadas, partidos, actas y hasta qué jornada está completo.',
  plan: 'agregado',
  presupuestoMs: 800,
  columnas: ['federacion', 'federacion_nombre', 'temporada', 'edicion', 'ambito', 'grupo', 'grupo_codigo',
    'jornadas_previstas', 'partidos_conocidos', 'partidos_con_resultado', 'actas_disponibles', 'actas_parseadas',
    'complete_through_matchday', 'visibility_state', 'calculado_en'],
  sql: `
    select f.codigo                    as federacion,
           f.nombre                    as federacion_nombre,
           s.etiqueta                  as temporada,
           e.nombre_publicado          as edicion,
           e.ambito,
           g.nombre                    as grupo,
           g.codigo_externo            as grupo_codigo,
           g.jornadas_previstas,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.actas_disponibles,
           c.actas_parseadas,
           c.complete_through_matchday,
           c.visibility_state,
           c.calculado_en
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where ($1::text is null or f.codigo = $1)
     order by f.codigo, s.orden desc, e.nombre_publicado, g.orden, g.codigo_externo
     limit $2`,
};

/** Lo mínimo para saber, desde cualquier página, si un grupo está ya importado en el canónico. */
export type FilaGrupoCanonico = {
  federacion: string;
  grupo_codigo: string;
  visibility_state: string | null;
  complete_through_matchday: number | null;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  calculado_en: string | null;
};

/**
 * Todos los grupos importados, para poder marcarlos en las páginas que navegan el catálogo.
 *
 * Es una lista corta a propósito (`limit 500`): cuando el canónico tenga miles de grupos habrá que
 * sustituirla por una consulta por federación o por un agregado en `analytics.*`. Hoy son puñados.
 */
export const GRUPOS_DEL_CANONICO: Consulta<FilaGrupoCanonico> = {
  nombre: 'grupos-del-canónico',
  descripcion: 'Qué grupos están importados en el canónico, con su cobertura, para enlazarlos desde el catálogo.',
  plan: 'agregado',
  presupuestoMs: 300,
  columnas: ['federacion', 'grupo_codigo', 'visibility_state', 'complete_through_matchday',
    'partidos_conocidos', 'partidos_con_resultado', 'calculado_en'],
  sql: `
    select f.codigo          as federacion,
           g.codigo_externo  as grupo_codigo,
           c.visibility_state,
           c.complete_through_matchday,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.calculado_en
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     order by f.codigo, g.codigo_externo
     limit 500`,
};

/** Parámetros por defecto: los usan la página de diagnóstico y la prueba de contrato. */
export const PARAMETROS_POR_DEFECTO: Record<string, readonly unknown[]> = {
  'resumen-canónico': [],
  'cobertura-por-federación': [],
  'cobertura-por-grupo': [null, 200],
  'grupos-del-canónico': [],
};

/** Todas las consultas de cobertura, para las pruebas de contrato. */
export const CONSULTAS_COBERTURA = [RESUMEN_CANONICO, COBERTURA_POR_FEDERACION, COBERTURA_POR_GRUPO, GRUPOS_DEL_CANONICO] as const;
