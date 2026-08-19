import { describe, expect, it } from 'vitest';
import { minutosEntreCiclos, ritmo } from '../src/frecuencia.js';

const d = (iso: string) => new Date(iso);

describe('frecuencia adaptativa', () => {
  it('domingo por la tarde con partidos: cada 5 minutos', () => {
    expect(ritmo(d('2026-10-04T17:30:00'), true)).toBe('partidos');
  });
  it('domingo por la tarde sin partidos hoy: una vez por hora', () => {
    expect(ritmo(d('2026-10-04T17:30:00'), false)).toBe('finde');
  });
  it('de madrugada no se toca el servidor', () => {
    expect(minutosEntreCiclos(d('2026-10-04T04:00:00'), true)).toBe(0);
  });
  it('el lunes se miran las actas que aún se cierran', () => {
    expect(ritmo(d('2026-10-05T11:00:00'), false)).toBe('lunes');
  });
  it('entre semana, cada seis horas', () => {
    expect(minutosEntreCiclos(d('2026-10-07T11:00:00'), false)).toBe(360);
  });
  it('en verano, una vez al día', () => {
    expect(ritmo(d('2026-08-12T11:00:00'), false)).toBe('verano');
  });
});
