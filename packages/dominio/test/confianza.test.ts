import { describe, expect, it } from 'vitest';
import { ajustaReputacion, evalua, type Reporte } from '../src/confianza.js';

const r = (usuarioId: string, gl: number, gv: number, extra: Partial<Reporte> = {}): Reporte =>
  ({ usuarioId, golesLocal: gl, golesVisitante: gv, reputacion: 0, delegado: false,
     creado: '2026-09-20T17:00:00Z', ...extra });

describe('confianza', () => {
  it('el oficial gana siempre', () => {
    const v = evalua([r('a', 5, 0), r('b', 5, 0), r('c', 5, 0)], { golesLocal: 1, golesVisitante: 1 });
    expect(v).toMatchObject({ golesLocal: 1, golesVisitante: 1, nivel: 'oficial', confianza: 100 });
  });

  it('un solo reporte no confirma nada', () => {
    const v = evalua([r('a', 2, 1)]);
    expect(v.confianza).toBe(35);
    expect(v.nivel).toBe('coincidente');
  });

  it('dos personas que coinciden suben la confianza', () => {
    expect(evalua([r('a', 2, 1), r('b', 2, 1)]).nivel).toBe('confirmado');
  });

  it('un reporte contradictorio baja la confianza y marca disputa', () => {
    const v = evalua([r('a', 2, 1), r('b', 2, 1), r('c', 9, 0)]);
    expect(v.enDisputa).toBe(true);
    expect(v.confianza).toBe(70 - 25);
    expect(v.golesLocal).toBe(2);
  });

  it('el delegado del club pesa', () => {
    expect(evalua([r('a', 2, 1, { delegado: true })]).confianza).toBe(50);
  });

  it('el mismo usuario no vota dos veces: vale su último reporte', () => {
    const v = evalua([
      r('a', 1, 0, { creado: '2026-09-20T17:00:00Z' }),
      r('a', 2, 1, { creado: '2026-09-20T17:45:00Z' }),
    ]);
    expect(v.golesLocal).toBe(2);
    expect(v.confianza).toBe(35);
    expect(v.enDisputa).toBe(false);
  });

  it('el usuario quemado no suma', () => {
    expect(evalua([r('a', 9, 0, { reputacion: -40 })].slice()).confianza).toBe(0);
  });

  it('la reputación se ajusta contra el oficial', () => {
    expect(ajustaReputacion(r('a', 2, 1), 2, 1)).toBe(2);
    expect(ajustaReputacion(r('a', 2, 1), 0, 0)).toBe(-5);
  });
});
