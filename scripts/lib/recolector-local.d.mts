/**
 * Tipos de la librería del recolector para las pruebas y los diagnósticos que la importan.
 *
 * El fichero es un `.mjs` y las pruebas son `.ts` que se comprueban con `tsc -b`: sin esta declaración, la
 * importación no resuelve y `pnpm lint` falla. TypeScript resuelve `./recolector-local.mjs` contra
 * `./recolector-local.d.mts`, así que este fichero tiene que estar al lado y llamarse así.
 */

/** Una fila de partido tal y como la devuelven los extractores. */
export type FilaExtraida = {
  local: string;
  visitante: string;
  codLocal: string | null;
  codVisitante: string | null;
  codActa: string | null;
  golesLocal?: number | null;
  golesVisitante?: number | null;
  fecha?: string | null;
  hora?: string | null;
  campo?: string | null;
  campoCodigo?: string | null;
  arbitro?: string | null;
};

/** Cómo reconoce una fila informativa cada maqueta. */
export type AdaptadorExtraccion = {
  maqueta: string;
  vocabularioDescanso: readonly string[];
  delimitaFilaDePartido: string;
  extraeCeldasDirectas: string;
  ignoraSubtablas: string;
  marcadoresDeEstado: string;
  evidenciaParaCorregir: string;
  cuandoDevuelveIncidencia: string;
};

export type ReconocimientoInformativa = {
  informativa: boolean;
  sospechosa: boolean;
  maqueta: string;
  local: string;
  visitante: string;
  motivo: string;
  /** El equipo que descansa, o nulo si los dos lados son la palabra de descanso. */
  equipoQueDescansa: string | null;
};

export const ADAPTADORES_EXTRACCION: Record<string, AdaptadorExtraccion>;

export function normalizaNombreDeFila(literal: string): string;
export function esPalabraDeDescansoDeMaqueta(literal: string, maqueta: string): boolean;
export function reconoceFilaInformativa(datos: {
  maqueta: string; local: string; visitante: string; tieneActa: boolean;
}): ReconocimientoInformativa | null;
export function extraeFilasInformativas(html: string): ReconocimientoInformativa[];

export function extraePartidos(html: string): FilaExtraida[];
export function extraePartidosWidget(html: string): FilaExtraida[];

export function extraeJornadas(html: string): Array<{ numero: number; fecha: string | null; url: string | null }>;
export function extraeCompeticiones(html: string): Array<{ codigo: string; nombre: string }>;
export function extraeGrupos(html: string): Array<{ codigo: string; nombre: string }>;
export function inspeccionaActa(html: string): { jugadores: number };
export function inspeccionaPagina(html: string, tipo: string): { ok: boolean; bloqueo?: boolean; motivo?: string };
export function urlJornada(temporada: string, competicion: string, grupo: string, jornada: number): string;
export function urlClasificacion(temporada: string, competicion: string, grupo: string, jornada: number): string;
