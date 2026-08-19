import { describe, expect, it } from 'vitest';
import { calculaClasificacion, enfrentamientoCompleto } from '../src/clasificacion.js';
import type { Partido } from '../src/tipos.js';

const p = (
  jornada: number, local: string, gl: number | null, gv: number | null, visitante: string,
): Partido => ({ jornada, fecha: null, local, visitante, golesLocal: gl, golesVisitante: gv });

describe('clasificación', () => {
  it('cuenta puntos, goles y racha', () => {
    const t = calculaClasificacion([
      p(1, 'A', 2, 1, 'B'),
      p(2, 'A', 0, 0, 'C'),
      p(3, 'B', 3, 0, 'C'),
    ]);
    const a = t.find((f) => f.equipo === 'A')!;
    expect(a).toMatchObject({ posicion: 1, puntos: 4, jugados: 2, ganados: 1, empatados: 1, diferencia: 1 });
    expect(a.racha).toEqual(['G', 'E']);
    expect(a.casa.ganados).toBe(1);
    expect(t.find((f) => f.equipo === 'C')!.puntos).toBe(1);
  });

  it('ignora los partidos sin resultado', () => {
    const t = calculaClasificacion([p(1, 'A', null, null, 'B')]);
    expect(t.every((f) => f.jugados === 0)).toBe(true);
    expect(t).toHaveLength(2);
  });

  it('resta las sanciones de puntos', () => {
    const t = calculaClasificacion([p(1, 'A', 2, 1, 'B')], {
      sanciones: [{ equipo: 'A', puntos: 3, motivo: 'alineación indebida' }],
    });
    expect(t.find((f) => f.equipo === 'A')!.puntos).toBe(0);
    expect(t.find((f) => f.equipo === 'A')!.sancion).toBe(3);
  });

  describe('desempate', () => {
    it('usa el enfrentamiento directo cuando ya se han visto las dos veces', () => {
      const partidos = [
        p(1, 'A', 0, 1, 'B'),   // gana B
        p(2, 'B', 0, 1, 'A'),   // gana A  → mini-liga 3-3, dif 0
        p(3, 'A', 5, 0, 'C'),
        p(4, 'B', 1, 0, 'C'),
        p(5, 'C', 0, 0, 'A'),
        p(6, 'C', 0, 0, 'B'),
      ];
      const t = calculaClasificacion(partidos);
      // A y B empatan a puntos y a enfrentamiento directo → decide la general
      expect(t[0]!.equipo).toBe('A');
      expect(t[0]!.desempatePor).toBe('diferencia-general');
    });

    it('el enfrentamiento directo manda sobre la diferencia general', () => {
      const partidos = [
        p(1, 'A', 1, 0, 'B'),
        p(2, 'B', 0, 0, 'A'),   // mini-liga A-B: A 4 puntos, B 1
        p(3, 'A', 1, 0, 'C'),
        p(4, 'C', 3, 0, 'A'),
        p(5, 'B', 9, 0, 'C'),   // B infla la diferencia general: +13 contra -1
        p(6, 'C', 0, 5, 'B'),
      ];
      const t = calculaClasificacion(partidos);
      expect(t.map((f) => f.equipo)).toEqual(['A', 'B', 'C']);
      expect(t[0]!.desempatePor).toBe('enfrentamiento-directo');
    });

    it('NO usa el enfrentamiento directo si aún falta el partido de vuelta', () => {
      const partidos = [
        p(1, 'A', 1, 0, 'B'),
        p(2, 'B', null, null, 'A'),  // vuelta sin jugar
        p(3, 'A', 0, 3, 'C'),
        p(4, 'B', 4, 0, 'C'),
      ];
      expect(enfrentamientoCompleto(['A', 'B'], partidos)).toBe(false);
      const t = calculaClasificacion(partidos);
      // A y B a 3 puntos: decide la diferencia general, no el directo
      expect(t[0]!.equipo).toBe('B');
      expect(t[0]!.desempatePor).toBe('diferencia-general');
    });

    it('con tres empatados construye el mini-grupo entero', () => {
      const partidos = [
        // A gana a B, B gana a C, C gana a A: los tres a 12 puntos
        p(1, 'A', 3, 0, 'B'), p(2, 'B', 0, 3, 'A'),
        p(3, 'B', 1, 0, 'C'), p(4, 'C', 0, 1, 'B'),
        p(5, 'C', 1, 0, 'A'), p(6, 'A', 0, 1, 'C'),
        // D es el saco de boxeo, y le da a B una diferencia general enorme
        p(7, 'A', 1, 0, 'D'), p(8, 'D', 0, 1, 'A'),
        p(9, 'B', 9, 0, 'D'), p(10, 'D', 0, 9, 'B'),
        p(11, 'C', 1, 0, 'D'), p(12, 'D', 0, 1, 'C'),
      ];
      // por diferencia general saldría B, A, C (+14, +6, +2)
      // pero el mini-grupo manda: A +4, C 0, B -4
      const t = calculaClasificacion(partidos);
      expect(t.map((f) => f.equipo)).toEqual(['A', 'C', 'B', 'D']);
      expect(t[0]!.desempatePor).toBe('enfrentamiento-directo');
    });

    it('avisa cuando el empate sólo lo rompe un sorteo', () => {
      const t = calculaClasificacion([
        p(1, 'A', 1, 1, 'B'), p(2, 'B', 1, 1, 'A'),
      ]);
      expect(t[0]!.desempatePor).toBe('sorteo');
      expect(t.every((f) => f.sorteoPendiente)).toBe(true);
    });
  });
});
