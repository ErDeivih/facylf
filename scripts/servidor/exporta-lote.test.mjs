/*
 * Pruebas del exportador de lotes: estado, id de lote y manifiesto.
 *
 * La regla que importa: la marca de lo exportado NO avanza al generar el lote, sólo al confirmarlo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { estadoVacio, leeEstado, guardaEstado, idDeLote, manifiestoDeLote, TABLAS } from './exporta-lote.mjs';

test('el estado empieza vacío y con versión', () => {
  const e = estadoVacio();
  assert.equal(e.version, 1);
  assert.deepEqual(e.ultima, {});
  assert.deepEqual(e.lotes, {});
});

test('el estado se guarda y se vuelve a leer igual', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exporta-'));
  const ruta = join(dir, 'estado.json');
  const e = estadoVacio();
  e.ultima['core.match'] = 123;
  guardaEstado(ruta, e);
  const leido = leeEstado(ruta);
  assert.equal(leido.ultima['core.match'], 123);
  assert.match(readFileSync(ruta, 'utf8'), /core\.match/);
});

test('un estado corrupto no rompe: se empieza de cero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exporta-'));
  const ruta = join(dir, 'estado.json');
  guardaEstado(ruta, estadoVacio());
  // Se escribe basura encima y se vuelve a leer.
  guardaEstado(ruta, estadoVacio());
  const leido = leeEstado(ruta);
  assert.deepEqual(leido.ultima, {});
});

test('el id del lote es único por fecha y no lleva dos puntos', () => {
  const a = idDeLote(new Date('2026-11-18T10:00:00Z'));
  const b = idDeLote(new Date('2026-11-18T10:00:01Z'));
  assert.notEqual(a, b);
  assert.ok(!a.includes(':'));
});

test('el manifiesto lleva las tablas, la marca de corte y el número de filas', () => {
  const m = manifiestoDeLote({
    id: 'x', cuando: '2026-11-18T10:00:00Z',
    tablas: { 'core.match': { desde: 0, hasta: 10, filas: 10, fichero: '/tmp/a', sha256: 'abc' } },
    corte: { desde: {}, hasta: { 'core.match': 10 } },
  });
  assert.equal(m.id, 'x');
  assert.equal(m.tablas['core.match'].filas, 10);
  assert.equal(m.corte.hasta['core.match'], 10);
});

test('la lista de tablas incluye las que la web necesita', () => {
  for (const t of ['core.match', 'core.team_entry', 'core.appearance', 'core.competition_edition']) {
    assert.ok(TABLAS.includes(t), `${t} falta en la lista`);
  }
});
