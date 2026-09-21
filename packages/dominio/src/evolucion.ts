import type { FilaClasificacion, Partido } from './tipos.js';
import { calculaClasificacion } from './clasificacion.js';
import { mismoEquipo } from './normaliza.js';

/**
 * Evolución de la clasificación a lo largo de la temporada.
 *
 * Para cada jornada se calcula la tabla tal y como quedaría contando solo los partidos
 * jugados hasta esa jornada. Es lo que permite el gráfico de posición/por jornada y la
 * racha.
 */

export interface PuntoEvolucion {
  jornada: number;
  filas: FilaClasificacion[];
}

/** La clasificación después de cada jornada (solo partidos con `jornada <= J`). */
export function evolucionPorJornada(partidos: Partido[]): PuntoEvolucion[] {
  const jornadas = [...new Set(partidos.map((p) => p.jornada))]
    .sort((a, b) => a - b);
  return jornadas.map((j) => ({
    jornada: j,
    filas: calculaClasificacion(partidos.filter((p) => p.jornada <= j)),
  }));
}

export interface SerieEquipo {
  /** Posición del equipo al cierre de cada jornada (1..N). null si aún no ha jugado. */
  posicion: (number | null)[];
  /** Puntos acumulados al cierre de cada jornada. */
  puntos: number[];
  jornadas: number[];
}

/** Serie de posición y puntos de un equipo, jornada a jornada. */
export function serieDeEquipo(partidos: Partido[], equipo: string): SerieEquipo {
  const puntos: SerieEquipo = { posicion: [], puntos: [], jornadas: [] };
  for (const { jornada, filas } of evolucionPorJornada(partidos)) {
    const fila = filas.find((f) => mismoEquipo(f.equipo, equipo));
    puntos.jornadas.push(jornada);
    puntos.puntos.push(fila?.jugados ? fila.puntos : 0);
    puntos.posicion.push(fila?.jugados ? fila.posicion : null);
  }
  return puntos;
}

/** Posición de un equipo al final de la liga regular. */
export function posicionFinal(partidos: Partido[], equipo: string): number | null {
  const filas = calculaClasificacion(partidos);
  const fila = filas.find((f) => mismoEquipo(f.equipo, equipo));
  return fila?.jugados ? fila.posicion : null;
}
