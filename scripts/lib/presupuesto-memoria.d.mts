/**
 * Tipos del gobernador de memoria, para que TypeScript pueda importarlo desde las pruebas.
 *
 * El módulo es JavaScript a propósito (lo usan los recolectores, que son `.mjs`), pero las pruebas de
 * `packages/ingesta/test` se compilan con `tsc -b`, y sin esta declaración la construcción entera fallaba con
 * `TS7016: Could not find a declaration file` — medido el 18/09/2026 al construir la imagen de Docker.
 *
 * Las firmas están copiadas del módulo: si alguna cambia, esta declaración tiene que cambiar con ella.
 */

/** Coste medido de un recolector con su navegador abierto, en GB (0,75 el 17/09/2026). */
export const COSTE_POR_RECOLECTOR_GB: number;

/** Reserva que no se toca nunca: el sistema operativo, la base de datos y el propio agente. */
export const RESERVA_GB: number;

/** Minutos que un worker conserva su plaza cuando hay federaciones esperando. */
export const TURNO_PLAZA_MIN: number;

/** Tiempo sin latido tras el cual la plaza de un worker se da por abandonada. */
export const SIN_LATIDO_MS: number;

export interface Reparto {
  presupuestoTotalGb: number;
  reservaGb: number;
  paraNavegadoresGb: number;
  costePorRecolectorGb: number;
  plazas: number;
  motivo: string;
}

/** Plazas de navegador que caben en el presupuesto. */
export function repartePlazas(opciones?: {
  memoriaGb?: number | string;
  memoriaTotalGb?: number;
  costePorRecolectorGb?: number;
  reservaGb?: number;
}): Reparto;

export interface DecisionReciclado {
  reciclar: boolean;
  motivo: string;
  medidoMb: number | null;
}

/** ¿Toca reciclar el navegador por consumo (o por número de trabajos)? */
export function tocaReciclar(opciones: {
  hechos: number;
  cada: number;
  memoriaMb?: number | string | null;
  topeMb?: number;
}): DecisionReciclado;

export interface DecisionEspera {
  salir: boolean;
  esperadoMs: number;
  minutos: number;
  motivo: string;
}

/** ¿Seguir esperando plaza o salir en limpio? */
export function decideEsperaDePlaza(opciones: {
  esperandoDesdeMs: number;
  ahoraMs: number;
  topeMs?: number | null;
  motivoDelHueco?: string;
}): DecisionEspera;

export interface Hueco {
  cabe: boolean;
  motivo: string;
}

/** ¿Cabe un navegador más en el reparto y en el sistema? */
export function cabeOtroNavegador(opciones?: {
  plazas?: number;
  ocupadas?: number;
  /** Lo que le queda a este contenedor (cgroups) o al sistema si no hay cgroups. */
  memoriaLibreGb?: number;
  reservaGb?: number;
  /** Y lo que le queda al SISTEMA, para dejarle sitio a lo demás (PostgreSQL, la web, el sistema operativo). */
  memoriaDeLaMaquinaGb?: number;
  reservaDeLaMaquinaGb?: number;
}): Hueco;

export interface DecisionTurno {
  ceder: boolean;
  motivo: string;
  minutos: number | null;
}

/** ¿Ha caducado el turno de la plaza, habiendo federaciones esperando? */
export function decideTurnoDePlaza(opciones?: {
  desdeMs?: number;
  ahoraMs?: number;
  topeMs?: number | null;
  hayEspera?: boolean;
}): DecisionTurno;

export interface EstadoPlaza {
  abandonada: boolean;
  motivo: string;
}

/** ¿Se puede dar por abandonada la plaza de un worker? */
export function plazaAbandonada(opciones?: {
  pid?: number;
  /** Contenedor que escribió la ficha (`hostname`): si no es el mío, el PID no significa lo mismo. */
  host?: string | null;
  /** Mi contenedor, para saber si la ficha es de mi espacio de identificadores. */
  miHost?: string | null;
  procesoVivo?: boolean;
  ultimoLatidoMs?: number;
  ahoraMs?: number;
  sinLatidoMs?: number;
}): EstadoPlaza;

/** Ficha de la plaza RESERVADA de la federación prioritaria (CyL): `slot-prioridad.lock`. */
export const PLAZA_PRIORITARIA: string;

/** Cuántas plazas reparten las federaciones normales (una menos si la prioritaria está activa). Nunca menos de una. */
export function plazasCompartidas(opciones?: {
  plazas?: number | string;
  prioritariaActiva?: boolean;
}): number;

/** ¿Tiene que ceder su plaza numerada este worker porque la prioritaria ha ocupado la suya? */
export function cedePorPrioridad(opciones?: {
  nombreSlot?: string | null;
  plazas?: number | string;
  prioritariaActiva?: boolean;
}): { ceder: boolean; motivo: string };
