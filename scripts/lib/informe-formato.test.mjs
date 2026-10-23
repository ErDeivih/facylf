import test from 'node:test';
import assert from 'node:assert/strict';
import { formatoPartido, duracionCategoria, jugadoresSql, duracionSql } from './informe-formato.mjs';

test('la modalidad publicada manda sobre la categoría', () => {
  assert.equal(formatoPartido({ modalidad: 'futbol8', categoria: 'alevin' }).jugadores, 8);
  assert.equal(formatoPartido({ modalidad: 'futbol7', categoria: 'benjamin' }).jugadores, 7);
  assert.equal(formatoPartido({ modalidad: 'futbol11', categoria: 'infantil' }).jugadores, 11);
  assert.equal(formatoPartido({ modalidad: 'futbol8', categoria: 'alevin' }).formatoDeclarado, true);
});

test('sin modalidad se usa el supuesto histórico del motor y se marca como no declarado', () => {
  const alevin = formatoPartido({ modalidad: 'desconocida', categoria: 'alevin' });
  assert.equal(alevin.jugadores, 7);
  assert.equal(alevin.formatoDeclarado, false);
  const juvenil = formatoPartido({ categoria: 'juvenil' });
  assert.equal(juvenil.jugadores, 11);
  assert.equal(juvenil.formatoDeclarado, false);
});

test('fútbol sala y playa no tienen minutos calculables: duración nula, nunca 90', () => {
  for (const modalidad of ['sala', 'playa']) {
    const f = formatoPartido({ modalidad, categoria: 'juvenil' });
    assert.equal(f.duracion, null);
    assert.equal(f.minutosCalculables, false);
  }
});

test('duraciones reglamentarias, con y sin tilde, sin confundir benjamín y prebenjamín', () => {
  assert.deepEqual(
    ['prebenjamín', 'benjamín', 'alevín', 'infantil', 'cadete', 'juvenil', 'aficionados', 'desconocida'].map(duracionCategoria),
    [40, 50, 60, 70, 80, 90, 90, 90],
  );
});

test('los fragmentos SQL usan el alias recibido y no dejan un 11 fijo', () => {
  assert.match(jugadoresSql('ce_x'), /ce_x\.modalidad/);
  assert.match(duracionSql('ce_x'), /ce_x\.modalidad in \('sala','playa'\) then null/);
});
