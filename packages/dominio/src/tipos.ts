/** Tipos del dominio. Sin dependencias: esto se prueba solo y en milisegundos. */

/** Un enfrentamiento. `local` y `visitante` son el `nombre_fed` literal de la federación. */
export interface Partido {
  jornada: number;
  /** Fecha de la jornada en ISO (yyyy-mm-dd). Ojo: la federación la publica siempre
   *  en domingo aunque el partido se juegue el sábado. Ver skill `parser-federacion`. */
  fecha: string | null;
  hora?: string | null;
  campo?: string | null;
  local: string;
  visitante: string;
  golesLocal: number | null;
  golesVisitante: number | null;
}

export type Signo = 'G' | 'E' | 'P';

export interface Parcial {
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  golesFavor: number;
  golesContra: number;
  puntos: number;
}

export interface FilaClasificacion extends Parcial {
  posicion: number;
  equipo: string;
  diferencia: number;
  /** Últimos resultados, del más antiguo al más reciente. */
  racha: Signo[];
  casa: Parcial;
  fuera: Parcial;
  /** Puntos restados por sanción (positivo = puntos que se le quitan). */
  sancion: number;
  /** Qué criterio le puso por delante del siguiente empatado a puntos. */
  desempatePor: CriterioDesempate | null;
  /** true cuando el empate no lo resuelve ningún criterio y toca sorteo.
   *  La interfaz debe decirlo, no fingir un orden. */
  sorteoPendiente: boolean;
}

export type CriterioDesempate =
  | 'puntos'
  | 'enfrentamiento-directo'
  | 'diferencia-general'
  | 'goles-favor'
  | 'sorteo';

export interface Sancion {
  equipo: string;
  puntos: number;
  motivo?: string;
}
