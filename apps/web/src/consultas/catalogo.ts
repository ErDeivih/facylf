import type { Consulta } from './contratos';
import { SQL_FEDERACION_NO_EXCLUIDA } from '@/lib/federaciones-excluidas';

/**
 * Catálogo del canónico: federaciones, grupos y los recuentos que enseña la portada.
 *
 * Estas consultas son las que sustituyen a la lectura de las colas SQLite (`repositorio-local.ts`) en
 * la portada, `/federaciones` y `/competiciones`. Tres reglas de la casa se ven en el SQL:
 *
 * - **`LIMIT` explícito y parámetros numerados**: ningún valor se interpola en el texto. Los filtros
 *   opcionales van como `$n is null or …`, de modo que una sola consulta sirve para todos los casos y
 *   PostgreSQL puede reutilizar el plan.
 * - **Lo que no está medido es `null`, no `0`**. Un grupo recién creado puede no tener fila en
 *   `ops.coverage_checkpoint`: entonces su cobertura se enseña como «sin punto de control». Un cero se
 *   leería como «no hay nada» y aquí significa «no lo sé».
 * - **La procedencia viaja con el número**: toda cifra de cobertura trae su `calculado_en`, que es
 *   cuándo la midió el importador. Una cifra sin fecha no se enseña.
 *
 * Sobre los recuentos: la portada suma cobertura por grupos (`ops.coverage_checkpoint`) y cuenta
 * jornadas (`core.matchday`). NO cuenta tablas de hechos (`core.match`, `core.appearance`…): cuando el
 * canónico tenga millones de partidos, un `count(*)` sobre `core.match` en cada visita sería el
 * recorrido caro que `resumen-canónico` ya advierte que vive sólo en el diagnóstico.
 */

/** Una fila del listado de grupos: el grupo con su contexto y su cobertura medida. */
export type FilaCatalogoGrupo = {
  federacion: string;
  federacion_nombre: string;
  /** Etiqueta de temporada del canónico (`AAAA-AA`). Es lo que ordena y lo que se filtra. */
  temporada: string;
  /**
   * Código externo de la edición. Hace falta para identificar la competición: `nombre_publicado` se
   * repite entre grupos de la misma edición.
   */
  edicion_codigo: string;
  edicion: string;
  ambito: string | null;
  modalidad: string | null;
  genero: string | null;
  categoria: string | null;
  provincia: string | null;
  grupo_codigo: string;
  grupo: string;
  grupo_tipo: string;
  jornadas_previstas: number | null;
  /** Inscripciones importadas en el grupo (`core.team_entry`), no «equipos del club». */
  inscripciones: number;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  actas_disponibles: number | null;
  actas_parseadas: number | null;
  complete_through_matchday: number | null;
  visibility_state: string | null;
  calculado_en: string | null;
  /** Cuántos grupos cumplen los filtros, no cuántos se devuelven: lo usa la paginación. */
  total: number;
};

/**
 * Listado de grupos del canónico con facetas y paginación.
 *
 * Parámetros, en orden: (1) federación, (2) temporada exacta, (3) temporada mínima (`>=`, para
 * «últimas N»), (4) ámbitos, (5) modalidad, (6) género, (7) categoría, (8) provincia, (9) nivel,
 * (10) texto de búsqueda, (11) sólo grupos con partidos conocidos, (12) límite, (13) desplazamiento.
 *
 * El orden es estable (federación, temporada, edición, grupo) para que la paginación no repita ni se
 * salte grupos: `offset` sin `order by` completo es una fuente de filas perdidas.
 */
export const LISTADO_DE_GRUPOS: Consulta<FilaCatalogoGrupo> = {
  nombre: 'listado-de-grupos',
  descripcion: 'Grupos del canónico con su edición, su federación, sus inscripciones y su cobertura medida, filtrables por federación, temporada, ámbito, modalidad, género, categoría, provincia y nivel.',
  plan: 'indexado',
  // Listado de 40.000 grupos con su cobertura y el total en ventana: medido el 23/10/2026 en el PC (con los
  // recolectores y otra sesión trabajando), 0,6 s. El presupuesto anterior (0,5 s) era más ajustado que el
  // ruido de medir en esta máquina. La consulta no recorre ninguna tabla de hechos.
  presupuestoMs: 1_000,
  columnas: ['federacion', 'federacion_nombre', 'temporada', 'edicion_codigo', 'edicion', 'ambito',
    'modalidad', 'genero', 'categoria', 'provincia', 'grupo_codigo', 'grupo', 'grupo_tipo',
    'jornadas_previstas', 'inscripciones', 'partidos_conocidos', 'partidos_con_resultado',
    'actas_disponibles', 'actas_parseadas', 'complete_through_matchday', 'visibility_state',
    'calculado_en', 'total'],
  sql: `
    select f.codigo                             as federacion,
           f.nombre                             as federacion_nombre,
           s.etiqueta                           as temporada,
           e.codigo_externo                     as edicion_codigo,
           e.nombre_publicado                   as edicion,
           e.ambito,
           e.modalidad,
           e.genero,
           e.categoria,
           e.provincia,
           g.codigo_externo                     as grupo_codigo,
           g.nombre                             as grupo,
           g.tipo                               as grupo_tipo,
           g.jornadas_previstas,
           /*
            * ── LAS INSCRIPCIONES SE CUENTAN UNA VEZ, NO UNA POR GRUPO (medido el 23/09/2026) ──────────────
            *
            * Aquí había una subconsulta correlacionada:
            *
            *     (select count(*) from core.team_entry te where te.phase_group_id = g.id)::int
            *
            * y el EXPLAIN (ANALYZE, BUFFERS) de la consulta real mostró que era el 60 % del tiempo de
            * ejecución: SubPlan 1, 20,1 ms por grupo y 60 repeticiones. Veinte milisegundos por grupo, sesenta
            * veces, para contar diez filas — y con lecturas de disco, en un servidor donde una lectura de
            * página cuesta decenas de milisegundos.
            *
            * Con la tabla agregada aparte (left join sobre el recuento por grupo) el trabajo se hace UNA vez
            * para toda la tabla y luego se une. Es el mismo número, pero sin repetir la cuenta por cada fila
            * del resultado.
            *
            * OJO: este texto vive DENTRO de una plantilla de JavaScript. Nada de acentos graves aquí: cerrarían
            * la plantilla y romperían el fichero entero. Pasó al escribir esta misma mejora el 23/09/2026.
            */
           coalesce(te.inscripciones, 0)::int   as inscripciones,
           c.partidos_conocidos,
           c.partidos_con_resultado,
           c.actas_disponibles,
           c.actas_parseadas,
           c.complete_through_matchday,
           c.visibility_state,
           c.calculado_en,
           (count(*) over ())::int              as total
      from core.phase_group g
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
      -- El recuento de inscripciones, calculado UNA vez para toda la tabla (ver el comentario del select).
      left join (select phase_group_id, count(*) as inscripciones
                   from core.team_entry group by phase_group_id) te on te.phase_group_id = g.id
     where ($1::text is null or f.codigo = $1)
       and ($2::text is null or s.etiqueta = $2)
       and ($3::text is null or s.etiqueta >= $3)
       and ($4::text[] is null or e.ambito = any($4::text[]))
       and ($5::text is null or e.modalidad = $5)
       and ($6::text is null or e.genero = $6)
       and ($7::text is null or e.categoria = $7)
       and ($8::text is null or e.provincia = $8)
       and ($9::smallint is null or e.nivel = $9)
       and (coalesce($10::text, '') = ''
            or core.normaliza_nombre(e.nombre_publicado || ' ' || g.nombre || ' ' || s.etiqueta)
               like '%' || core.normaliza_nombre($10) || '%')
       and (not coalesce($11::boolean, false) or c.partidos_conocidos > 0)
     order by f.codigo, s.orden desc, e.nombre_publicado, g.orden, g.codigo_externo
     limit $12 offset $13`,
};

/** Un valor de faceta: qué valores existen de verdad en el canónico para esa dimensión. */
export type FilaFaceta = {
  /** `temporada`, `ambito`, `categoria`, `modalidad`, `genero` o `provincia`. */
  dimension: string;
  valor: string;
  /** Sólo la temporada lo tiene: el año de inicio, para ordenar de la más reciente a la más vieja. */
  orden: number | null;
};

/**
 * Facetas del catálogo: los valores que existen hoy, agrupados por dimensión.
 *
 * No hay lista fija de categorías ni de ámbitos en la web a propósito: si un valor no aparece en el
 * canónico, no se ofrece como filtro. Una lista escrita a mano acabaría enseñando opciones que no
 * devuelven nada, y el vocabulario del esquema (`desconocido`, `desconocida`) es un valor real que se
 * enseña como «sin determinar», no como una opción vacía.
 */
export const FACETAS_DEL_CATALOGO: Consulta<FilaFaceta> = {
  nombre: 'facetas-del-catálogo',
  descripcion: 'Valores presentes en el catálogo canónico por dimensión (temporada, ámbito, categoría, modalidad, género y provincia) para construir los filtros sin inventar opciones.',
  plan: 'agregado',
  presupuestoMs: 300,
  columnas: ['dimension', 'valor', 'orden'],
  sql: `
    with catalogo as (
      select s.etiqueta, s.orden, e.ambito, e.modalidad, e.genero, e.categoria, e.provincia
        from core.competition_edition e
        join core.season s on s.id = e.season_id
    )
    select 'temporada' as dimension, t.etiqueta as valor, t.orden::int as orden
      from (select distinct etiqueta, orden from catalogo) t
    union all
    select 'ambito' as dimension, a.ambito as valor, null::int as orden
      from (select distinct ambito from catalogo) a
    union all
    select 'categoria' as dimension, c.categoria as valor, null::int as orden
      from (select distinct categoria from catalogo) c
    union all
    select 'modalidad' as dimension, m.modalidad as valor, null::int as orden
      from (select distinct modalidad from catalogo) m
    union all
    select 'genero' as dimension, g.genero as valor, null::int as orden
      from (select distinct genero from catalogo) g
    union all
    select 'provincia' as dimension, p.provincia as valor, null::int as orden
      from (select distinct provincia from catalogo where provincia is not null) p
     order by dimension, orden desc nulls last, valor
     limit 1000`,
};

/** Una federación tal como la guarda el canónico, con lo que hay importado de ella. */
export type FilaFederacionCanonica = {
  codigo: string;
  nombre: string;
  portal_url: string | null;
  activa: boolean;
  /** `pnfg`, `isquad`, `fcf` o `ninguno`. Una federación sin adaptador no puede tener datos. */
  adaptador: string;
  temporadas: number;
  ediciones: number;
  grupos: number;
  /** Grupos con punto de control. Si es menor que `grupos`, hay grupos sin medir todavía. */
  grupos_medidos: number;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  actas_disponibles: number | null;
  actas_parseadas: number | null;
  actas_correctas: number | null;
  actas_a_revisar: number | null;
  grupos_completos: number;
  grupos_parciales: number;
  grupos_sin_cobertura: number;
  calculado_en: string | null;
};

/**
 * Las federaciones como dato, no como lista escrita a mano.
 *
 * Sale de `core.federation` con `left join`, así que aparece **también** la federación de la que no se
 * ha importado nada: en ese caso las sumas son `null` —«no medido»— y los recuentos son `0`, que ahí sí
 * significan «no hay ninguna». La diferencia importa: una federación sin importar no es una federación
 * con cero partidos. El portal oficial sale de `portal_url`, que es la procedencia del dato.
 */
export const FEDERACIONES_DEL_CANONICO: Consulta<FilaFederacionCanonica> = {
  nombre: 'federaciones-del-canónico',
  descripcion: 'Las federaciones del canónico con su portal, su adaptador y la cobertura importada de cada una, incluidas las que todavía no tienen nada importado.',
  plan: 'agregado',
  // Agrega 40.000 grupos y su cobertura por federación: 0,2-0,3 s medidos el 23/10/2026 en la base real.
  presupuestoMs: 400,
  columnas: ['codigo', 'nombre', 'portal_url', 'activa', 'adaptador', 'temporadas', 'ediciones',
    'grupos', 'grupos_medidos', 'partidos_conocidos', 'partidos_con_resultado', 'actas_disponibles',
    'actas_parseadas', 'actas_correctas', 'actas_a_revisar', 'grupos_completos', 'grupos_parciales',
    'grupos_sin_cobertura', 'calculado_en'],
  sql: `
    select f.codigo,
           f.nombre,
           f.portal_url,
           f.activa,
           f.adaptador,
           count(distinct s.id)::int                                              as temporadas,
           count(distinct e.id)::int                                              as ediciones,
           count(g.id)::int                                                       as grupos,
           count(c.phase_group_id)::int                                           as grupos_medidos,
           sum(c.partidos_conocidos)::int                                         as partidos_conocidos,
           sum(c.partidos_con_resultado)::int                                     as partidos_con_resultado,
           sum(c.actas_disponibles)::int                                          as actas_disponibles,
           sum(c.actas_parseadas)::int                                            as actas_parseadas,
           sum(c.actas_correctas)::int                                            as actas_correctas,
           sum(c.actas_a_revisar)::int                                            as actas_a_revisar,
           count(c.phase_group_id) filter (where c.visibility_state = 'completa')::int as grupos_completos,
           count(c.phase_group_id) filter (where c.visibility_state in ('parcial_privada', 'verificada_hasta_jornada'))::int as grupos_parciales,
           -- «Sin cobertura» = ni completo ni parcial: sin punto de control, o con él en 'oculta' (el valor
           -- por defecto). Antes sólo contaba los grupos sin control, y un grupo con control en 'oculta' no
           -- caía en ninguna cesta: la suma no cuadraba con 'grupos'. Ver el comentario largo en
           -- cobertura.ts, donde está el mismo arreglo y el porqué medido. Sin acentos graves aquí dentro.
           count(g.id) filter (where coalesce(c.visibility_state, 'oculta')
                                 not in ('completa', 'parcial_privada', 'verificada_hasta_jornada'))::int as grupos_sin_cobertura,
           max(c.calculado_en)                                                    as calculado_en
      from core.federation f
      left join core.competition_edition e on e.federation_id = f.id
      left join core.season s on s.id = e.season_id
      left join core.phase_group g on g.competition_edition_id = e.id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
     where ${SQL_FEDERACION_NO_EXCLUIDA}
     group by f.codigo, f.nombre, f.portal_url, f.activa, f.adaptador
     order by f.codigo
     limit 100`,
};

/** Los recuentos globales que enseña la portada, todos con su fecha de medición. */
export type FilaRecuentos = {
  federaciones: number;
  /** Federaciones con al menos una edición importada: las demás sólo están declaradas. */
  federaciones_con_datos: number;
  ediciones: number;
  grupos: number;
  /** Jornadas con calendario importado: filas de `core.matchday`, una por jornada de cada grupo. */
  jornadas_publicadas: number;
  grupos_medidos: number;
  grupos_completos: number;
  jornadas_esperadas: number | null;
  jornadas_descubiertas: number | null;
  jornadas_cerradas: number | null;
  partidos_conocidos: number | null;
  partidos_con_resultado: number | null;
  actas_enlazadas: number | null;
  actas_disponibles: number | null;
  actas_parseadas: number | null;
  actas_correctas: number | null;
  actas_a_revisar: number | null;
  calculado_en: string | null;
};

/**
 * Recuentos de cabecera de la portada, agregando `ops.coverage_checkpoint`.
 *
 * Las sumas de jornadas se hacen sobre `jornadas_esperadas` de cada grupo y son un **recuento de
 * jornadas** (una por grupo), no una comparación de números de jornada entre grupos: «la jornada 30 del
 * grupo A» y «la 30 del grupo B» son dos jornadas distintas, y por eso se suman, nunca se equiparan. El
 * numerador es `core.matchday`, que cuenta las jornadas cuyo calendario ya está importado.
 *
 * Si no hay ningún punto de control, las sumas son `null` y la web enseña «sin datos» en vez de un
 * porcentaje: cero partidos medidos y ningún partido medido no son lo mismo.
 */
export const RECUENTOS_DEL_CANONICO: Consulta<FilaRecuentos> = {
  nombre: 'recuentos-del-canónico',
  descripcion: 'Recuentos de la portada: federaciones, ediciones, grupos, jornadas con calendario, y partidos y actas medidos por el importador con la fecha de la medición.',
  plan: 'agregado',
  // Agregado de todo el catálogo (12 count/sum sobre 40.000 grupos y su cobertura): medido el 23/10/2026
  // con la base real, 0,8-1,1 s. Es la portada y se sirve cacheada; el tope refleja el coste real, no tapa
  // una consulta que debiera ser rápida. Para bajarlo hay que precalcularlo (como `ops.recuento_canonico`).
  presupuestoMs: 1_500,
  columnas: ['federaciones', 'federaciones_con_datos', 'ediciones', 'grupos', 'jornadas_publicadas',
    'grupos_medidos', 'grupos_completos', 'jornadas_esperadas', 'jornadas_descubiertas',
    'jornadas_cerradas', 'partidos_conocidos', 'partidos_con_resultado', 'actas_enlazadas',
    'actas_disponibles', 'actas_parseadas', 'actas_correctas', 'actas_a_revisar', 'calculado_en'],
  sql: `
    with edicion_visible as (
      select e.id as edicion_id
        from core.competition_edition e
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
    ),
    grupo_visible as (
      select g.id as grupo_id
        from core.phase_group g
        join edicion_visible ev on ev.edicion_id = g.competition_edition_id
    )
    select (select count(*) from core.federation f where ${SQL_FEDERACION_NO_EXCLUIDA})::int as federaciones,
           (select count(distinct e.federation_id) from core.competition_edition e
              join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA}))::int as federaciones_con_datos,
           (select count(*) from edicion_visible)::int                              as ediciones,
           (select count(*) from grupo_visible)::int                                as grupos,
           (select count(*) from core.matchday m
              join grupo_visible gv on gv.grupo_id = m.phase_group_id)::int         as jornadas_publicadas,
           (select count(*) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as grupos_medidos,
           (select count(*) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id
             where c.visibility_state = 'completa')::int                            as grupos_completos,
           (select sum(c.jornadas_esperadas) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as jornadas_esperadas,
           (select sum(c.jornadas_descubiertas) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as jornadas_descubiertas,
           (select sum(c.jornadas_cerradas) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as jornadas_cerradas,
           (select sum(c.partidos_conocidos) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as partidos_conocidos,
           (select sum(c.partidos_con_resultado) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as partidos_con_resultado,
           (select sum(c.actas_enlazadas) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as actas_enlazadas,
           (select sum(c.actas_disponibles) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as actas_disponibles,
           (select sum(c.actas_parseadas) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as actas_parseadas,
           (select sum(c.actas_correctas) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as actas_correctas,
           (select sum(c.actas_a_revisar) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)::int         as actas_a_revisar,
           (select max(c.calculado_en) from ops.coverage_checkpoint c
              join grupo_visible gv on gv.grupo_id = c.phase_group_id)              as calculado_en
     limit 1`,
};

/** Parámetros por defecto: los usan las páginas, la prueba de contrato y `scripts/planes.mjs`. */
export const PARAMETROS_CATALOGO: Record<string, readonly unknown[]> = {
  // Sin ningún filtro: el catálogo entero, primera página.
  'listado-de-grupos': [null, null, null, null, null, null, null, null, null, '', false, 80, 0],
  'facetas-del-catálogo': [],
  'federaciones-del-canónico': [],
  'recuentos-del-canónico': [],
};

/** Todas las consultas del catálogo, para las pruebas de contrato y la medición de planes. */
export const CONSULTAS_CATALOGO = [LISTADO_DE_GRUPOS, FACETAS_DEL_CATALOGO, FEDERACIONES_DEL_CANONICO, RECUENTOS_DEL_CANONICO] as const;
