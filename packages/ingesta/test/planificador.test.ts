import { describe, expect, it } from 'vitest';
import { cadenciaDefault, debidas } from '../src/planificador.js';

const MIN = 60_000;

describe('cadencia del planificador', () => {
  it('en fin de semana baja a diario (24 h) y entre semana cada 2 días', () => {
    const domingo = new Date('2026-09-20T12:00:00'); // domingo
    const martes = new Date('2026-09-22T12:00:00');  // martes
    expect(cadenciaDefault(domingo)).toBe(24 * 60);
    expect(cadenciaDefault(martes)).toBe(2 * 24 * 60);
  });

  it('da por debida una competición que nunca se ha descargado', () => {
    const ahora = new Date('2026-09-20T12:00:00');
    expect(debidas(ahora, [{ slug: 'juvenil-primera' }], {})).toEqual(['juvenil-primera']);
  });

  it('no repite una competición si aún no ha pasado su cadencia', () => {
    const martes = new Date('2026-09-22T12:00:00');
    const haceUnaHora = martes.getTime() - 60 * MIN;
    const c = { slug: 'juvenil-primera', cadaMinutos: 120 };
    // cadencia 120 min, hace 60 min → aún no toca
    expect(debidas(martes, [c], { 'juvenil-primera': haceUnaHora })).toEqual([]);
    // hace 121 min → toca
    expect(debidas(martes, [c], { 'juvenil-primera': martes.getTime() - 121 * MIN }))
      .toEqual(['juvenil-primera']);
  });

  it('usa la cadencia por defecto del momento cuando no hay override', () => {
    const martes = new Date('2026-09-22T12:00:00');
    const c = { slug: 'cadete' };
    // cadencia por defecto un martes: 2 días. Hace 23 h y 59 min → aún no.
    const hace = martes.getTime() - (2 * 24 * 60 * MIN - MIN);
    expect(debidas(martes, [c], { cadete: hace })).toEqual([]);
    // hace 2 días → toca
    expect(debidas(martes, [c], { cadete: martes.getTime() - 2 * 24 * 60 * MIN }))
      .toEqual(['cadete']);
  });
});
