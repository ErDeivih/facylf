import type { Consulta, FilaFederacion, FilaGrupo, FilaResumen } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Consultas de cobertura.
 *
 * Reglas de la casa (RENDIMIENTO-BUSQUEDA.md): toda consulta lleva `LIMIT`, ningún valor se
 * interpola en el texto —van todos por parámetros— y no se suman jornadas esperadas de grupos
 * distintos, porque ese número no significa nada.
 *
 * (La portada sí suma `ops.coverage_checkpoint.jornadas_esperadas` por grupos, pero como **recuento**
 * de jornadas —una por grupo—, no equiparando el número de jornada de un grupo con el de otro: eso
 * vive en `catalogo.ts`, no aquí.)
 *
 * Lo que se enseña sale de `ops.coverage_checkpoint`, que el importador recalcula al cerrar cada
 * lote. La web **no** calcula completitud recorriendo partidos: eso sería una segunda verdad.
 */

/**
 * Recuento global del canónico. Es un recorrido caro a propósito (cuenta tablas de hechos enteras) y
 * por eso vive en el diagnóstico, no en una página pública: cuando el canónico tenga millones de
 * partidos habrá que sustituirlo por los agregados de `analytics.*`.
 *
 * ── ESE MOMENTO HA LLEGADO, Y ESTA VEZ NO SE ARREGLA SUBIENDO EL PRESUPUESTO (medido el 29/09/2026) ────
 *
 * Con 693.483 partidos, 9.255.291 apariciones y 925.769 personas tardaba 2-3 s en caliente (25/09/2026) y se
 * subió el presupuesto a 20 s para que la prueba de contrato no fallara por tiempo. Cuatro días después la
 * prueba vuelve a fallar, y el número dice por qué. Medido recuento a recuento, con `psql` y `\timing` dentro
 * del contenedor (ver `scripts/mide-resumen-canonico.ps1`):
 *
 *                        en frío        en caliente
 *   appearance           25,4 s          12,9 s      (1.312 MB de tabla + 2.534 MB de índices)
 *   match_event          10,3 s           6,6 s
 *   match                 3,3 s           1,2 s
 *   todo lo demás        < 0,3 s         < 0,3 s
 *
 * El canónico ha crecido un 30 % en esos cuatro días —860.178 partidos, 11.905.695 apariciones, 6.049.223
 * eventos, 1.213.588 personas— y el resumen vive **justo en el borde del presupuesto**: en frío se pasa de
 * largo (suma ~40 s) y en caliente queda alrededor de los 20 s. Por eso la misma prueba unas veces pasa y otras
 * no: **el veredicto depende de si la caché está templada, no del contrato**. Un test que pasa o falla según la
 * caché no comprueba nada, y subirle el presupuesto sólo mueve el borde de sitio.
 *
 * **No es un problema de plan ni de índices:** `count(*)` recorre la tabla entera y la tabla no cabe en caché
 * (1,3 GB de tabla frente a los 128 MB por defecto de `shared_buffers`), así que el tiempo es el de leerla del
 * disco. Y se sirve desde una página: `/canonico` la usa (`app/src/app/canonico/page.tsx`).
 *
 * ── ARREGLADO EN LA 0047: DEJAR DE CONTAR EN CALIENTE ───────────────────────────────────────────────────
 *
 * `ops.recuento_canonico` guarda una fila con los recuentos y se recalcula al cerrar cada pasada del
 * proyector (`scripts/proyectar-lectura.mjs`). Esta consulta lee una fila por clave primaria: deja de
 * recorrer las tablas de hechos en cada visita a `/canonico`. Si la fila no existe (base sin migrar), no
 * devuelve filas y la página dice que aún no hay medida — nunca un 0 que parecería una medida real.
 */
export const RESUMEN_CANONICO: Consulta<FilaResumen> = {
  nombre: 'resumen-canónico',
  descripcion: 'Cuánto hay en el canónico: federaciones, ediciones, grupos, partidos, actas, participaciones, eventos y personas.',
  plan: 'agregado',
  // Con la 0047 es la lectura de una fila (índice por clave): 0,4 ms medidos. El presupuesto de 20 s era
  // del recuento en caliente y ya no tiene sentido; si esto vuelve a pasar de 100 ms, es que alguien
  // devolvió los `count(*)` a la consulta.
  presupuestoMs: 100,
  columnas: ['federaciones', 'ediciones', 'grupos', 'partidos', 'informes', 'participaciones', 'eventos', 'personas', 'grupos_completos', 'calculado_en'],
  sql: `
    -- 0047: una fila con los recuentos (ops.recuento_canonico), recalculada al cerrar cada pasada del
    -- proyector. Antes eran diez count(*) sobre las tablas de hechos (19,5 M de apariciones): la consulta
    -- pasaba del presupuesto de 20 s. Si la fila no existe (base sin migrar) no se devuelven filas y la
    -- página dice que aún no hay medida; no se inventa un 0.
    select r.federaciones, r.ediciones, r.grupos, r.partidos, r.informes, r.participaciones,
           r.eventos, r.personas, r.grupos_completos, r.calculado_en
      from ops.recuento_canonico r
     where r.id = 1
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
           /*
            * «Sin cobertura» es TODO lo que no es ni completo ni parcial: o no hay punto de control, o lo
            * hay y dice 'oculta' —que es el valor por defecto—. Antes esta cesta sólo contaba los grupos
            * SIN punto de control, así que un grupo con control en estado 'oculta' no caía en ninguna de
            * las tres y la suma no cuadraba con 'grupos'.
            *
            * No era teórico: se destapó el 24/09/2026 al pasar de 227 a 794 grupos, porque la carga masiva
            * crea puntos de control para grupos que sólo tienen calendario y se quedan en 'oculta'. Lo cazó
            * la prueba de contrato que exige que las tres cestas repartan TODOS los grupos.
            *
            * Se escribe como «no está en las otras dos» y no como «es igual a oculta» a propósito: así la
            * cesta sigue siendo exhaustiva si mañana aparece un estado nuevo, en vez de dejar otro hueco.
            *
            * OJO: nada de acentos graves en este comentario. Va DENTRO de una plantilla de JavaScript y un
            * acento grave la cerraría, rompiendo el fichero entero.
            */
           count(*) filter (where coalesce(c.visibility_state, 'oculta')
                              not in ('completa', 'parcial_privada', 'verificada_hasta_jornada'))::int as grupos_sin_cobertura,
           max(c.calculado_en)                                               as calculado_en
      from core.federation f
      join core.competition_edition e on e.federation_id = f.id
      join core.phase_group g on g.competition_edition_id = e.id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where ${SQL_FEDERACION_NO_EXCLUIDA}
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
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
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
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
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
