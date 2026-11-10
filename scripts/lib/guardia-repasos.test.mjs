import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tocaRepaso } from './guardia-repasos.mjs';

/*
 * PRUEBAS DE LA GUARDIA DE REPASOS CAROS
 *
 * Defienden un coste real medido el 10/11/2026: el worker, al arrancar, repasa el ámbito de TODAS las actas
 * (165.585 filas) y en este disco eso son decenas de minutos. Con la guardia sólo se paga una vez al día: un
 * reinicio no puede costar una hora de recolección.
 */

const ahora = Date.parse('2026-11-10T12:00:00.000Z');
const haceHoras = (h) => new Date(ahora - h * 3600_000).toISOString();

test('sin repaso anterior, toca repasar', () => {
  assert.equal(tocaRepaso({ ultimaVez: null, ahoraMs: ahora, horasMaximas: 24 }), true);
});

test('un repaso de hace una hora no vuelve a tocarse', () => {
  assert.equal(tocaRepaso({ ultimaVez: haceHoras(1), ahoraMs: ahora, horasMaximas: 24 }), false);
});

test('un repaso de hace 25 horas sí toca', () => {
  assert.equal(tocaRepaso({ ultimaVez: haceHoras(25), ahoraMs: ahora, horasMaximas: 24 }), true);
});

test('una fecha ilegible no bloquea el repaso (mejor pagar que quedarse sin corregir)', () => {
  assert.equal(tocaRepaso({ ultimaVez: 'no es una fecha', ahoraMs: ahora, horasMaximas: 24 }), true);
});

test('una fecha del futuro (reloj movido) no bloquea para siempre: toca repasar', () => {
  assert.equal(tocaRepaso({ ultimaVez: '2030-01-01T00:00:00.000Z', ahoraMs: ahora, horasMaximas: 24 }), true);
});
