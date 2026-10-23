/**
 * Contratos de lectura del canónico: los tipos de entrada y salida, sin nada de Next.
 *
 * Van aparte de la implementación a propósito: una página o una prueba pueden importar el contrato
 * sin arrastrar el driver de PostgreSQL, y el adaptador de SQLite (mientras exista el puente
 * temporal) tiene que devolver exactamente estas formas.
 */

/** Una consulta del catálogo: qué promete, cuánto puede tardar y su texto SQL. */
export type Consulta<Fila> = {
  nombre: string;
  descripcion: string;
  /** Presupuesto p95 en milisegundos. La prueba de contrato lo mide sobre volumen real. */
  presupuestoMs: number;
  /**
   * Cómo debe recorrerse:
   *  · `indexado` — filtra por federación y grupo: no puede acabar en un `Seq Scan` sobre una tabla de
   *    hechos (partidos, participaciones, eventos, fichas). Lo comprueba `scripts/planes.mjs`.
   *  · `agregado` — cuenta o resume tablas enteras porque es lo que pide la consulta. Ninguna agrega
   *    tablas de hechos: las de cobertura y catálogo (`ops.coverage_checkpoint`, `core.phase_group`…)
   *    son pequeñas y acotadas, y `resumen-canónico` —el único recuento global de hechos— vive en la
   *    página de diagnóstico a propósito. Lo comprueba `apps/web/test/planes.test.ts`.
   */
  plan: 'indexado' | 'agregado';
  /**
   * Con qué rol se ejecuta (0050). Por defecto `lector` (`facylf_lector`, todo lo público). `app` = datos de
   * usuario o de administración (`app.*`): se ejecuta con `facylf_app` y sólo en páginas con sesión, nunca en
   * una página pública ni cacheada entre usuarios. Lo comprueba `pruebas/sql/m50.mjs` (cada consulta con su rol).
   */
  rol?: 'lector' | 'app';
  /** Columnas que la consulta promete. La prueba falla si desaparece alguna. */
  columnas: readonly (keyof Fila & string)[];
  sql: string;
};

export type FilaResumen = {
  federaciones: number; ediciones: number; grupos: number; partidos: number; informes: number;
  participaciones: number; eventos: number; personas: number; grupos_completos: number; calculado_en: string | null;
};

export type FilaFederacion = {
  codigo: string; nombre: string; temporadas: number; ediciones: number; grupos: number;
  partidos_conocidos: number; partidos_con_resultado: number; actas_disponibles: number; actas_parseadas: number;
  grupos_completos: number; grupos_parciales: number; grupos_sin_cobertura: number; calculado_en: string | null;
};

export type FilaGrupo = {
  federacion: string; federacion_nombre: string; temporada: string; edicion: string; ambito: string | null;
  grupo: string; grupo_codigo: string; jornadas_previstas: number | null;
  partidos_conocidos: number | null; partidos_con_resultado: number | null;
  actas_disponibles: number | null; actas_parseadas: number | null;
  complete_through_matchday: number | null; visibility_state: string | null; calculado_en: string | null;
};

/** Estados de visibilidad del esquema. Un valor fuera de esta lista es un error, no un caso raro. */
export const ESTADOS_VISIBILIDAD = ['oculta', 'parcial_privada', 'verificada_hasta_jornada', 'completa'] as const;
