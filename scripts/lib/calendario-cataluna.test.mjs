import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interpretaCabeceraJornadaFcf } from './calendario-cataluna.mjs';

test('lee la cabecera actual de la FCF, con la fecha en el mismo nodo', () => {
  assert.deepEqual(interpretaCabeceraJornadaFcf('JORNADA 1 2025-09-20'), {
    numero: 1,
    fecha: '2025-09-20',
  });
});

test('sigue aceptando la maqueta anterior sin fecha y espacios variables', () => {
  assert.deepEqual(interpretaCabeceraJornadaFcf('  JORNADA   30  '), { numero: 30, fecha: null });
});

test('no confunde botones, resultados u otros textos con una cabecera', () => {
  for (const texto of ['30', 'RESULTATS', 'PROPERA JORNADA 2', '', null]) {
    assert.equal(interpretaCabeceraJornadaFcf(texto), null);
  }
});
