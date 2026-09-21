import { describe, expect, it } from 'vitest';
import { historialDe } from '../src/historial.js';
import type { Partido } from '../src/tipos.js';

const eq = (local: string, visitante: string, gl: number, gv: number): Partido =>
  ({ jornada: 1, fecha: null, local, visitante, golesLocal: gl, golesVisitante: gv });

const t1: Partido[] = [eq('Equipo A', 'Equipo B', 2, 0), eq('Equipo B', 'Equipo A', 0, 1)];
const t2: Partido[] = [eq('Equipo A', 'Equipo B', 0, 2), eq('Equipo B', 'Equipo A', 3, 1)];

describe('histórico entre temporadas', () => {
  it('resume por temporada para un equipo', () => {
    const h = historialDe('Equipo A', [
      { temporada: '2025/26', partidos: t1 },
      { temporada: '2026/27', partidos: t2 },
    ]);
    expect(h).toHaveLength(2);
    expect(h[0]!).toMatchObject({ temporada: '2025/26', jugados: 2, ganados: 2, puntos: 6 });
    expect(h[1]!).toMatchObject({ temporada: '2026/27', jugados: 2, perdidos: 2, puntos: 0 });
  });
});
