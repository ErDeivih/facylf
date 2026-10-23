import test from 'node:test';
import assert from 'node:assert/strict';
import { ajustePuntos } from './informe-dashboard.mjs';

test('la sanción real del Intercity (instantánea del 27/09): 37 puntos con 12G 4E son −3', () => {
  assert.equal(ajustePuntos({ puntos: 37, ganados: 12, empatados: 4 }), -3);
});
test('sin diferencia no hay aviso', () => {
  assert.equal(ajustePuntos({ puntos: '40', ganados: '12', empatados: '4' }), 0);
});
test('un dato ausente no se convierte en cero', () => {
  assert.equal(ajustePuntos({ puntos: 37, ganados: null, empatados: 4 }), null);
  assert.equal(ajustePuntos({ puntos: undefined, ganados: 12, empatados: 4 }), null);
});
