import type { Consulta } from './contratos';

/**
 * Observabilidad: lo que las pantallas de «Datos» y «Salud» leen del canónico con el rol público.
 *
 * ── DE DÓNDE SALE CADA COSA (y por qué no se inventa nada) ─────────────────────────────────────────
 *
 *  · `ops.chequeos()` es la comprobación de salud que ya mantiene el proyecto: 68 pruebas con su valor,
 *    su umbral y su estado (`ok`/`info`/`aviso`/`fallo`). Es la única puerta que el rol de lectura tiene
 *    a las alertas, porque la tabla de alertas no está entre sus permisos; la función sí está concedida.
 *    Es cara a propósito (cuenta ventanas recientes sobre tablas de hechos): se llama una vez y se
 *    cachea (`observabilidad-cache.ts`).
 *  · `ops.coverage_checkpoint` es la cobertura CALCULADA: partidos conocidos, con resultado, actas
 *    disponibles, parseadas, correctas y a revisar, por grupo. Es lo que permite enseñar cobertura de
 *    verdad (y sus fechas de cálculo) sin contar tablas de hechos enteras en cada visita.
 *  · `analytics.federacion_capacidad` y `analytics.parametro_capacidad` responden «qué datos da cada
 *    federación» con sus umbrales reales (40 % de cambios para minutos, 15 % de tarjetas para
 *    disciplina, 80 % de goles con minuto, 30 % de actas para alineaciones). Los umbrales se leen de la
 *    base: no van escritos a mano en la interfaz.
 *  · `ops.recuento_canonico` es el recuento precalculado del canónico (no se recorre `core` para contar
 *    un millón de partidos en cada visita).
 *
 * Los valores `numeric` de PostgreSQL se piden con `::float8` para que lleguen como números: un valor de
 * salud que llega como texto se compara mal y se pinta peor.
 */

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Comprobaciones de salud
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Una comprobación de salud tal y como la devuelve el canónico. */
export type FilaChequeo = {
  nombre: string;
  /** `base`, `procesos`, `frescura`, `calidad`, `identidad`, `rendimiento`, `copias`, `avisos`, `web`… */
  area: string;
  /** `ok`, `info`, `aviso` o `fallo`. */
  estado: string;
  valor: number | null;
  umbral: number | null;
  detalle: unknown;
};

/**
 * Las 68 comprobaciones, en el estado en que están AHORA.
 *
 * Presupuesto 6 s: es una consulta cara por diseño (ventanas de 60 días sobre partidos, eventos y
 * apariciones) y la web la cachea; el presupuesto propio evita que el `statement_timeout` de 5 s del
 * resto de la web la corte por una máquina cargada.
 */
export const CHEQUEOS_DE_LA_PLATAFORMA: Consulta<FilaChequeo> = {
  nombre: 'chequeos-de-la-plataforma',
  descripcion: 'Todas las comprobaciones de salud de la plataforma en este momento: área, estado, valor medido, umbral y detalle.',
  plan: 'agregado',
  presupuestoMs: 30000,
  columnas: ['nombre', 'area', 'estado', 'valor', 'umbral', 'detalle'],
  sql: `
    select nombre,
           area,
           estado,
           valor::float8,
           umbral::float8,
           detalle
      from ops.chequeos()`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Cobertura de una federación, temporada a temporada
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Cobertura de una federación en una temporada, sumada de sus grupos. */
export type FilaCoberturaTemporada = {
  temporada: string;
  orden: number;
  grupos: number;
  partidos: number;
  con_resultado: number;
  actas_disponibles: number;
  actas_parseadas: number;
  actas_correctas: number;
  actas_a_revisar: number;
  /** Última vez que se calculó la cobertura de esos grupos. */
  calculado_en: string | null;
};

/**
 * Cobertura de una federación por temporada. Parámetros: (1) código de federación, (2) temporadas.
 *
 * Sale de `ops.coverage_checkpoint` unido al catálogo (grupo → edición → federación y temporada):
 * agrega 50.000 filas de cobertura contra tablas pequeñas de catálogo, no contra partidos.
 */
export const COBERTURA_POR_TEMPORADA: Consulta<FilaCoberturaTemporada> = {
  nombre: 'cobertura-por-temporada',
  descripcion: 'Cobertura calculada de una federación por temporada: grupos, partidos conocidos y con resultado, actas disponibles, parseadas, correctas y a revisar, y cuándo se calculó.',
  plan: 'agregado',
  presupuestoMs: 600,
  columnas: ['temporada', 'orden', 'grupos', 'partidos', 'con_resultado', 'actas_disponibles',
    'actas_parseadas', 'actas_correctas', 'actas_a_revisar', 'calculado_en'],
  sql: `
    select s.etiqueta                                                 as temporada,
           s.orden                                                    as orden,
           count(cc.phase_group_id)::int                               as grupos,
           coalesce(sum(cc.partidos_conocidos), 0)::int                as partidos,
           coalesce(sum(cc.partidos_con_resultado), 0)::int            as con_resultado,
           coalesce(sum(cc.actas_disponibles), 0)::int                 as actas_disponibles,
           coalesce(sum(cc.actas_parseadas), 0)::int                   as actas_parseadas,
           coalesce(sum(cc.actas_correctas), 0)::int                   as actas_correctas,
           coalesce(sum(cc.actas_a_revisar), 0)::int                   as actas_a_revisar,
           max(cc.calculado_en)::text                                  as calculado_en
      from ops.coverage_checkpoint cc
      join core.phase_group g          on g.id = cc.phase_group_id
      join core.competition_edition e  on e.id = g.competition_edition_id
      join core.federation f          on f.id = e.federation_id
      join core.season s              on s.id = e.season_id
     where f.codigo = $1
     group by s.etiqueta, s.orden
     order by s.orden desc
     limit $2`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Qué datos da cada federación
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Capacidad de datos medida de una federación en una temporada. */
export type FilaCapacidad = {
  federacion: string;
  nombre: string;
  temporada: string;
  orden: number;
  ediciones: number;
  partidos: number;
  pct_resultado: number | null;
  pct_alineacion: number | null;
  pct_cambios: number | null;
  pct_tarjetas: number | null;
  pct_minuto_gol: number | null;
  pct_arbitro: number | null;
  pct_posicion: number | null;
};

/**
 * Qué datos publica cada federación, medido sobre lo importado (`analytics.federacion_capacidad`).
 *
 * Devuelve todas las temporadas y federaciones (207 filas): la pantalla elige la temporada de
 * referencia con `temporadaDeReferencia` (la última cerrada) para no comparar una temporada a medias.
 */
export const CAPACIDAD_DE_FEDERACIONES: Consulta<FilaCapacidad> = {
  nombre: 'capacidad-de-federaciones',
  descripcion: 'Qué datos publica cada federación (resultado, alineaciones, cambios, tarjetas, minuto de gol, árbitro y posición), en porcentaje, por temporada.',
  plan: 'agregado',
  presupuestoMs: 300,
  columnas: ['federacion', 'nombre', 'temporada', 'orden', 'ediciones', 'partidos', 'pct_resultado',
    'pct_alineacion', 'pct_cambios', 'pct_tarjetas', 'pct_minuto_gol', 'pct_arbitro', 'pct_posicion'],
  sql: `
    select federacion,
           nombre,
           temporada,
           orden::int,
           ediciones::int,
           partidos::int,
           pct_resultado::float8,
           pct_alineacion::float8,
           pct_cambios::float8,
           pct_tarjetas::float8,
           pct_minuto_gol::float8,
           pct_arbitro::float8,
           pct_posicion::float8
      from analytics.federacion_capacidad
     order by orden desc, federacion`,
};

/** Un umbral de capacidad, tal y como lo guarda el proyecto. */
export type FilaParametroCapacidad = {
  clave: string;
  valor: number;
  descripcion: string;
};

/** Los umbrales de capacidad (40 % de cambios, 15 % de tarjetas, 80 % de minuto, 30 % de actas…). */
export const PARAMETROS_DE_CAPACIDAD: Consulta<FilaParametroCapacidad> = {
  nombre: 'parametros-de-capacidad',
  descripcion: 'Umbrales con los que se decide qué datos se pueden enseñar (cambios, tarjetas, minuto de gol, posiciones y alineaciones).',
  plan: 'agregado',
  presupuestoMs: 100,
  columnas: ['clave', 'valor', 'descripcion'],
  sql: `
    select clave, valor::float8, descripcion
      from analytics.parametro_capacidad
     order by clave`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Frescura y cobertura por federación (una foto)
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Recuento precalculado del canónico. */
export type RecuentoCanonico = {
  federaciones: number;
  ediciones: number;
  grupos: number;
  partidos: number;
  informes: number;
  personas: number;
  calculado_en: string | null;
};

/** Cobertura agregada de una federación (todos sus grupos importados). */
export type CoberturaDeFederacion = {
  federacion: string;
  nombre: string;
  grupos: number;
  partidos: number;
  con_resultado: number;
  actas_parseadas: number;
  calculado_en: string | null;
};

/** Una fila con la frescura de los datos y la cobertura de cada federación. */
export type FilaFrescura = {
  recuento: RecuentoCanonico;
  /** Fecha de la última acta importada; `null` si no hay ninguna. */
  ultima_acta: string | null;
  cobertura: CoberturaDeFederacion[];
};

/**
 * Frescura de la plataforma en una sola fila: recuento precalculado, última acta importada y cobertura
 * de cada federación con su fecha de cálculo. Todo son agregados de catálogo y de la cobertura guardada.
 */
export const FRESCURA_Y_COBERTURA: Consulta<FilaFrescura> = {
  nombre: 'frescura-y-cobertura',
  descripcion: 'Frescura de la plataforma: recuento precalculado del canónico, fecha de la última acta importada, actas de los últimos 30 días y cobertura por federación con su fecha de cálculo.',
  plan: 'agregado',
  presupuestoMs: 1200,
  columnas: ['recuento', 'ultima_acta', 'cobertura'],
  sql: `
    select (select jsonb_build_object(
              'federaciones', r.federaciones::int,
              'ediciones', r.ediciones::int,
              'grupos', r.grupos::int,
              'partidos', r.partidos::int,
              'informes', r.informes::int,
              'personas', r.personas::int,
              'calculado_en', r.calculado_en::text)
             from ops.recuento_canonico r
            limit 1)                                                      as recuento,
           (select max(ingested_at)::text from core.match_report)          as ultima_acta,
           coalesce((
             select jsonb_agg(jsonb_build_object(
                      'federacion', x.codigo,
                      'nombre', x.nombre,
                      'grupos', x.grupos,
                      'partidos', x.partidos,
                      'con_resultado', x.con_resultado,
                      'actas_parseadas', x.actas_parseadas,
                      'calculado_en', x.calculado_en) order by x.partidos desc nulls last)
               from (select f.codigo,
                            f.nombre                                             as nombre,
                            count(cc.phase_group_id)::int                        as grupos,
                            coalesce(sum(cc.partidos_conocidos), 0)::int         as partidos,
                            coalesce(sum(cc.partidos_con_resultado), 0)::int     as con_resultado,
                            coalesce(sum(cc.actas_parseadas), 0)::int            as actas_parseadas,
                            max(cc.calculado_en)::text                           as calculado_en
                       from ops.coverage_checkpoint cc
                       join core.phase_group g         on g.id = cc.phase_group_id
                       join core.competition_edition e on e.id = g.competition_edition_id
                       join core.federation f         on f.id = e.federation_id
                      where f.codigo not like 'pruebas%'
                      group by 1, 2) x), '[]'::jsonb)                     as cobertura`,
};

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * Ejemplos reales para la pantalla de estados
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Un grupo real que sirve de ejemplo de un estado vacío. */
export type EjemploDeEstado = {
  grupo: number | null;
  nombre: string | null;
  edicion: string | null;
  temporada: string | null;
  partidos: number | null;
  con_resultado: number | null;
  /** Actas: disponibles en el caso «sin actas»; parseadas en el caso «sin cambios». */
  con_acta: number | null;
};

export type FilaEstados = {
  datos: {
    sin_resultado: EjemploDeEstado | null;
    sin_calendario: EjemploDeEstado | null;
    sin_actas: EjemploDeEstado | null;
    sin_cambios: EjemploDeEstado | null;
  };
};

/**
 * Cuatro grupos REALES de Castilla y León que ejemplifican los estados vacíos: calendario sin
 * resultados, sin calendario, con resultados pero sin actas, y con actas que no apuntan cambios.
 *
 * Cada uno se busca en la temporada más reciente que lo cumpla; si no existe, el bloque llega `null`
 * y la pantalla no lo enseña (no se inventa un ejemplo).
 */
export const EJEMPLOS_DE_ESTADOS: Consulta<FilaEstados> = {
  nombre: 'ejemplos-de-estados',
  descripcion: 'Cuatro grupos reales de Castilla y León que ejemplifican los estados vacíos de una competición (sin resultados, sin calendario, sin actas y sin minutos), con sus cifras.',
  plan: 'agregado',
  presupuestoMs: 500,
  columnas: ['datos'],
  sql: `
    select jsonb_build_object(
      'sin_resultado', (
        select jsonb_build_object(
                 'grupo', cc.phase_group_id::int, 'nombre', g.nombre, 'edicion', e.nombre_publicado,
                 'temporada', s.etiqueta, 'partidos', cc.partidos_conocidos::int,
                 'con_resultado', cc.partidos_con_resultado::int, 'con_acta', null)
          from ops.coverage_checkpoint cc
          join core.phase_group g         on g.id = cc.phase_group_id
          join core.competition_edition e on e.id = g.competition_edition_id
          join core.federation f         on f.id = e.federation_id
          join core.season s             on s.id = e.season_id
         where f.codigo = 'castilla-leon'
           and cc.partidos_conocidos > 0 and coalesce(cc.partidos_con_resultado, 0) = 0
         order by s.orden desc, cc.partidos_conocidos desc
         limit 1),
      'sin_calendario', (
        select jsonb_build_object(
                 'grupo', cc.phase_group_id::int, 'nombre', g.nombre, 'edicion', e.nombre_publicado,
                 'temporada', s.etiqueta, 'partidos', cc.partidos_conocidos::int,
                 'con_resultado', null, 'con_acta', null)
          from ops.coverage_checkpoint cc
          join core.phase_group g         on g.id = cc.phase_group_id
          join core.competition_edition e on e.id = g.competition_edition_id
          join core.federation f         on f.id = e.federation_id
          join core.season s             on s.id = e.season_id
         where f.codigo = 'castilla-leon' and coalesce(cc.partidos_conocidos, 0) = 0
         order by s.orden desc, cc.jornadas_esperadas desc
         limit 1),
      'sin_actas', (
        select jsonb_build_object(
                 'grupo', cc.phase_group_id::int, 'nombre', g.nombre, 'edicion', e.nombre_publicado,
                 'temporada', s.etiqueta, 'partidos', cc.partidos_conocidos::int,
                 'con_resultado', cc.partidos_con_resultado::int, 'con_acta', coalesce(cc.actas_disponibles, 0)::int)
          from ops.coverage_checkpoint cc
          join core.phase_group g         on g.id = cc.phase_group_id
          join core.competition_edition e on e.id = g.competition_edition_id
          join core.federation f         on f.id = e.federation_id
          join core.season s             on s.id = e.season_id
         where f.codigo = 'castilla-leon'
           and coalesce(cc.partidos_con_resultado, 0) > 0 and coalesce(cc.actas_disponibles, 0) = 0
         order by s.orden desc, cc.partidos_con_resultado desc
         limit 1),
      'sin_cambios', (
        select jsonb_build_object(
                 'grupo', (select min(pg.id)::int from core.phase_group pg where pg.competition_edition_id = ec.competition_edition_id),
                 'nombre', g.nombre, 'edicion', e.nombre_publicado, 'temporada', s.etiqueta,
                 'partidos', ec.partidos::int, 'con_resultado', null, 'con_acta', ec.con_acta::int)
          from analytics.edicion_capacidad ec
          join core.competition_edition e on e.id = ec.competition_edition_id
          join core.federation f         on f.id = e.federation_id
          join core.season s             on s.id = e.season_id
          join lateral (
            select pg.nombre from core.phase_group pg
             where pg.competition_edition_id = ec.competition_edition_id
             order by pg.id limit 1) g on true
         where f.codigo = 'castilla-leon' and ec.con_acta > 0 and not ec.registra_cambios
         order by s.orden desc, ec.partidos desc
         limit 1)
    ) as datos`,
};

/** Todas las consultas de observabilidad, para la prueba de contrato. */
export const CONSULTAS_OBSERVABILIDAD = [
  CHEQUEOS_DE_LA_PLATAFORMA, COBERTURA_POR_TEMPORADA, CAPACIDAD_DE_FEDERACIONES, PARAMETROS_DE_CAPACIDAD,
  FRESCURA_Y_COBERTURA, EJEMPLOS_DE_ESTADOS,
] as const;

/** Parámetros de ejemplo para la prueba de contrato y para las mediciones. */
export const PARAMETROS_OBSERVABILIDAD: Record<string, readonly unknown[]> = {
  'chequeos-de-la-plataforma': [],
  'cobertura-por-temporada': ['castilla-leon', 12],
  'capacidad-de-federaciones': [],
  'parametros-de-capacidad': [],
  'frescura-y-cobertura': [],
  'ejemplos-de-estados': [],
};
