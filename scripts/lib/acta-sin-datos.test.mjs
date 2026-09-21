import test from 'node:test';
import assert from 'node:assert/strict';
import { decideActaSinDatos } from './acta-sin-datos.mjs';

const AHORA = Date.parse('2026-09-20T12:00:00.000Z');

test('una ficha vacía de la temporada vigente se aplaza sin cerrar ni detener la federación', () => {
  assert.deepEqual(decideActaSinDatos({ temporada: 21, temporadaActual: 21, intentos: 8, ahoraMs: AHORA }), {
    cerrar: false,
    cerrada: false,
    dias: 2,
    siguiente: '2026-09-22T12:00:00.000Z',
  });
});

test('una ficha histórica necesita dos comprobaciones antes de declararse sin datos', () => {
  assert.equal(decideActaSinDatos({ temporada: 20, temporadaActual: 21, intentos: 1, ahoraMs: AHORA }).cerrar, false);
  assert.deepEqual(decideActaSinDatos({ temporada: 20, temporadaActual: 21, intentos: 2, ahoraMs: AHORA }), {
    cerrar: true,
    cerrada: true,
    dias: null,
    siguiente: null,
  });
});
