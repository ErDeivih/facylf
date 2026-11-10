import { test } from 'node:test';
import assert from 'node:assert/strict';

import { enVentanaNocturna } from './ventana-nocturna.mjs';

/*
 * PRUEBAS DE LA VENTANA NOCTURNA
 *
 * Defienden un coste medido el 10/11/2026: el repaso de competiciones sin datos recorre la tabla de actas entera
 * (0,8 GB) y, si toca de día, se come la recolección de la mañana/tarde. Sólo debe hacerse en la ventana nocturna.
 */

test('a las 02:00 empieza la ventana', () => {
  assert.equal(enVentanaNocturna({ hora: 2 }), true);
});

test('a las 05:59 sigue la ventana', () => {
  assert.equal(enVentanaNocturna({ hora: 5 }), true);
});

test('a las 06:00 ya no', () => {
  assert.equal(enVentanaNocturna({ hora: 6 }), false);
});

test('a las 18:00 no toca (es el caso real que se comió la tarde)', () => {
  assert.equal(enVentanaNocturna({ hora: 18 }), false);
});

test('se puede cambiar la ventana', () => {
  assert.equal(enVentanaNocturna({ hora: 23, desde: 23, hasta: 24 }), true);
  assert.equal(enVentanaNocturna({ hora: 1, desde: 23, hasta: 24 }), false);
});
