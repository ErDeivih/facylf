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
   *  · `agregado` — cuenta o resume tablas enteras: el recorrido completo es lo que pide la consulta.
   *    Sólo las usa la página de diagnóstico, nunca una página pública.
   */
  plan: 'indexado' | 'agregado';
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
