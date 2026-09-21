/**
 * Tipos del adaptador de descanso de iSquad, para las pruebas que lo importan.
 *
 * El fichero es un `.mjs` y las pruebas son `.ts` que se comprueban con `tsc -b`: sin esta declaración la
 * importación no resuelve y `pnpm lint` falla. TypeScript resuelve `./filas-descanso-isquad.mjs` contra
 * `./filas-descanso-isquad.d.mts`, así que este fichero tiene que estar al lado y llamarse así.
 */

export type AdaptadorIsquad = {
  maqueta: string;
  vocabularioDescanso: readonly string[];
  delimitaFilaDePartido: string;
  extraeCeldasDirectas: string;
  ignoraSubtablas: string;
  marcadoresDeEstado: string;
  evidenciaParaCorregir: string;
  cuandoDevuelveIncidencia: string;
};

/** Una entrada del JSON de resultados de iSquad, ya normalizada. */
export type PartidoIsquad = {
  codacta?: string;
  cod_equipo_local?: string | null;
  cod_equipo_visitante?: string | null;
  local?: string;
  visitante?: string;
  resultado?: string;
  fecha?: string;
  hora?: string;
  campo?: string;
  arbitro?: string;
  hay_actas?: string;
};

export type ClasificacionDescanso = {
  informativa: boolean;
  motivo: string | null;
  equipoQueDescansa: string | null;
};

export type SeparacionDescansos<T> = {
  reales: T[];
  descansos: ClasificacionDescanso[];
  sospechosas: ClasificacionDescanso[];
  equiposQueDescansan: string[];
};

export const ADAPTADOR_ISQUAD: AdaptadorIsquad;
export function esLadoDeDescansoIsquad(codigo: unknown): boolean;
export function clasificaFilaDeDescansoIsquad(partido: PartidoIsquad): ClasificacionDescanso;
export function separaDescansos<T extends PartidoIsquad>(partidos: readonly T[]): SeparacionDescansos<T>;

/** Una fila de la jornada archivada, tal y como la devuelve el extractor de iSquad. */
export type PartidoExtraidoIsquad = {
  local: string;
  visitante: string;
  codLocal: string | null;
  codVisitante: string | null;
  codActa: string | null;
};

/** Una fila informativa, en la misma forma que las de las otras maquetas. */
export type FilaInformativaIsquad = {
  maqueta: string;
  local: string;
  visitante: string;
  informativa: boolean;
  sospechosa: boolean;
  motivo: string;
  equipoQueDescansa: string | null;
};

export function extraePartidosIsquad(contenido: unknown): PartidoExtraidoIsquad[];
export function extraeFilasInformativasIsquad(contenido: unknown): FilaInformativaIsquad[];

/** Una fila que se va a escribir: del origen, o la que la cola ya tenía y el acta sostiene. */
export type FilaAEscribir = {
  orden: number;
  partido?: PartidoIsquad;
  /** Presente cuando la posición era un bloque de descanso y se conserva la fila que ya estaba. */
  conservada?: { orden: number; local: string; visitante: string };
};

export function decideFilasDeJornada(entrada: {
  partidos: readonly PartidoIsquad[];
  filasActuales?: ReadonlyArray<{ orden: number; local: string; visitante: string }>;
  actaDe?: (codigoActa: unknown) => readonly [string | null, string | null] | null;
}): { filas: FilaAEscribir[]; recuperadas: number; descansos: number };
