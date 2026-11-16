import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatoDeLiga, partidosQueFaltan, partidosTotales } from './calendario-restante.mjs';

test('18 equipos y 34 jornadas es una liga a dos vueltas', () => {
  assert.equal(formatoDeLiga(18, 34), 'doble');
  assert.equal(partidosTotales(18, 'doble'), 306);
});

test('un grupo impar descansa: 7 equipos son 7 jornadas por vuelta', () => {
  assert.equal(formatoDeLiga(7, 7), 'simple');
  assert.equal(formatoDeLiga(7, 14), 'doble');
});

test('unas jornadas que no cuadran con ninguna liga no tienen formato', () => {
  assert.equal(formatoDeLiga(18, 30), null);
  assert.equal(formatoDeLiga(2, 2), null);
  assert.equal(formatoDeLiga(18, null), null);
});

test('a dos vueltas faltan los cruces ordenados que aún no existen', () => {
  const equipos = ['a', 'b', 'c', 'd'];
  const existentes = [{ local: 'a', visitante: 'b' }, { local: 'c', visitante: 'd' }];
  const faltan = partidosQueFaltan({ equipos, existentes, formato: 'doble' });
  assert.equal(faltan.length, 12 - 2);
  assert.ok(faltan.some((p) => p.local === 'b' && p.visitante === 'a'));
  assert.ok(!faltan.some((p) => p.local === 'a' && p.visitante === 'b'));
  assert.ok(faltan.every((p) => p.campoNeutral === false));
});

test('a una vuelta cada pareja se juega una vez, sin local conocido', () => {
  const faltan = partidosQueFaltan({ equipos: ['a', 'b', 'c'], existentes: [{ local: 'b', visitante: 'a' }], formato: 'simple' });
  assert.equal(faltan.length, 2);
  assert.ok(faltan.every((p) => p.campoNeutral));
});

test('un cruce repetido o un equipo ajeno invalidan la deducción', () => {
  const equipos = ['a', 'b', 'c'];
  assert.equal(partidosQueFaltan({ equipos, existentes: [{ local: 'a', visitante: 'b' }, { local: 'a', visitante: 'b' }], formato: 'doble' }), null);
  assert.equal(partidosQueFaltan({ equipos, existentes: [{ local: 'a', visitante: 'z' }], formato: 'doble' }), null);
});

test('una liga completa no deja nada por crear', () => {
  const equipos = ['a', 'b', 'c'];
  const existentes = [];
  for (const l of equipos) for (const v of equipos) if (l !== v) existentes.push({ local: l, visitante: v });
  assert.deepEqual(partidosQueFaltan({ equipos, existentes, formato: 'doble' }), []);
});
