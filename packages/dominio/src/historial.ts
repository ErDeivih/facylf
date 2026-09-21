import type { Partido } from './tipos.js';
import { calculaClasificacion } from './clasificacion.js';
import { mismoEquipo } from './normaliza.js';

/**
 * Histórico de un equipo a lo largo de varias temporadas.
 *
 * Cada temporada es un conjunto de partidos propios (ya parseados) con su etiqueta
 * ("2026/27", "2022/23"...). Sirve para la tabla y gráficas de múltiples años.
 */

export interface TemporadaConPartidos {
  temporada: string;
  partidos: Partido[];
}

export interface HistorialAnual {
  temporada: string;
  posicion: number | null;
  puntos: number;
  jugados: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  golesFavor: number;
  golesContra: number;
}

/** Resumen por temporada de un equipo (todo lo que se puede sacar de los partidos). */
export function historialDe(equipo: string, temporadas: TemporadaConPartidos[]): HistorialAnual[] {
  return temporadas.map((t) => {
    const fila = calculaClasificacion(t.partidos).find((f) => mismoEquipo(f.equipo, equipo));
    return {
      temporada: t.temporada,
      posicion: fila?.jugados ? fila.posicion : null,
      puntos: fila?.puntos ?? 0,
      jugados: fila?.jugados ?? 0,
      ganados: fila?.ganados ?? 0,
      empatados: fila?.empatados ?? 0,
      perdidos: fila?.perdidos ?? 0,
      golesFavor: fila?.golesFavor ?? 0,
      golesContra: fila?.golesContra ?? 0,
    };
  });
}
