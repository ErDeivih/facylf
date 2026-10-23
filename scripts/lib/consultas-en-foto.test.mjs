import test from 'node:test';
import assert from 'node:assert/strict';
import { ordenDeReparto } from './consultas-en-foto.mjs';

test('las más lentas la última vez salen primero; las desconocidas, al final y en su orden', () => {
  assert.deepEqual(
    ordenDeReparto(['a', 'b', 'c', 'd'], { b: 5800, d: 2000 }),
    ['b', 'd', 'a', 'c'],
  );
});
test('sin tiempos previos se conserva el orden declarado', () => {
  assert.deepEqual(ordenDeReparto(['x', 'y', 'z']), ['x', 'y', 'z']);
});
