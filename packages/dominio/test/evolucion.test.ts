import { describe, expect, it } from 'vitest';
import { evolucionPorJornada, serieDeEquipo, posicionFinal } from '../src/evolucion.js';
import type { Partido } from '../src/tipos.js';

const eq = (jornada: number, local: string, visitante: string, gl: number, gv: number): Partido =>
  ({ jornada, fecha: null, local, visitante, golesLocal: gl, golesVisitante: gv });

// 3 equipos: A gana a B 2-0 (J1); C gana a A 1-0 (J2); B gana a C 1-0 (J3)
const partidos: Partido[] = [
  eq(1, 'Equipo A', 'Equipo B', 2, 0),
  eq(2, 'Equipo C', 'Equipo A', 1, 0),
  eq(3, 'Equipo B', 'Equipo C', 1, 0),
];

describe('evolución por jornada', () => {
  it('calcula la tabla después de cada jornada', () => {
    const e = evolucionPorJornada(partidos);
    expect(e).toHaveLength(3);
    // tras la J1: A 3 pts (pos1), B 0, C 0
    expect(e[0]!.filas[0]!.equipo).toBe('Equipo A');
    expect(e[0]!.filas[0]!.puntos).toBe(3);
    // tras la J3: B 3, C 3, A 3 → desempate por enfrentamiento directo
    const ultima = e[2]!.filas;
    expect(ultima.map((f) => f.puntos)).toEqual([3, 3, 3]);
  });

  it('saca la serie de posición y puntos de un equipo', () => {
    const s = serieDeEquipo(partidos, 'Equipo C');
    expect(s.jornadas).toEqual([1, 2, 3]);
    expect(s.puntos).toEqual([0, 3, 3]);
  });

  it('da la posición final', () => {
    expect(posicionFinal(partidos, 'Equipo A')).not.toBeNull();
  });
});
