import { describe, expect, it } from 'vitest';
import { ambitoNominalTecnico, contextoNominal } from '../src/resolucion/contexto.js';

/*
 * Un técnico sin lado en el acta se identifica dentro de su EDICIÓN y se declara como edición. Antes
 * salía `ambito=equipo:<id de la edición>`, que colisiona con el equipo de ese mismo número.
 */
describe('ámbito nominal del cuerpo técnico', () => {
  it('con lado conocido, el ámbito es su equipo', () => {
    expect(ambitoNominalTecnico(8873, 41)).toEqual({ ambito: 'equipo', id: 8873 });
  });

  it('sin lado, el ámbito es la edición y así se declara', () => {
    expect(ambitoNominalTecnico(null, 41)).toEqual({ ambito: 'edicion', id: 41 });
  });

  it('un técnico sin lado en la edición 123 no comparte contexto con el homónimo del equipo 123', () => {
    const sinLado = ambitoNominalTecnico(null, 123);
    const delEquipo = ambitoNominalTecnico(123, 999);
    const a = contextoNominal('entrenador', '2025-26', sinLado.ambito, sinLado.id, 'juan perez');
    const b = contextoNominal('entrenador', '2025-26', delEquipo.ambito, delEquipo.id, 'juan perez');
    expect(a).not.toEqual(b);
    // Y ambos cumplen el formato que verifica la migración 0008.
    const formato = /^rol=[a-z0-9 ]+;temporada=[0-9]{4}-[0-9]{2};ambito=(edicion|equipo):[0-9]+;nombre=[a-z0-9 ]+$/;
    expect(a).toMatch(formato);
    expect(b).toMatch(formato);
  });
});
