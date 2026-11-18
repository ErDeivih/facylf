/*
 * Pruebas del receptor de lotes: comprobación del manifiesto.
 *
 * La regla que importa: un lote con un CSV que no cuadra con su sha256 no se carga, y un lote ya cargado
 * no se vuelve a cargar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verificaManifiesto, ORDEN } from './carga-lote.mjs';

function loteCon(contenido = 'id,x\n1,a\n') {
  const dir = mkdtempSync(join(tmpdir(), 'lote-'));
  const csv = join(dir, 'core_match.csv');
  writeFileSync(csv, contenido);
  const sha256 = createHash('sha256').update(contenido).digest('hex');
  writeFileSync(join(dir, 'manifiesto.json'), JSON.stringify({
    id: 'prueba', cuando: '2026-11-18T00:00:00Z', corte: {},
    tablas: { 'core.match': { desde: 0, hasta: 1, filas: 1, fichero: csv, sha256 } },
  }));
  return dir;
}

test('un lote correcto pasa la comprobación', () => {
  const { manifiesto, fallos } = verificaManifiesto(loteCon());
  assert.deepEqual(fallos, []);
  assert.equal(manifiesto.tablas['core.match'].filas, 1);
});

test('un CSV manipulado no pasa', () => {
  const dir = loteCon();
  writeFileSync(join(dir, 'core_match.csv'), 'id,x\n1,MANIPULADO\n');
  const { fallos } = verificaManifiesto(dir);
  assert.equal(fallos.length, 1);
  assert.match(fallos[0], /sha256/);
});

test('un CSV que falta no pasa', () => {
  const dir = loteCon();
  const { fallos } = verificaManifiesto(dir);
  assert.deepEqual(fallos, []);
  // Se borra el fichero y se vuelve a comprobar.
  const m = JSON.parse(readFileSync(join(dir, 'manifiesto.json'), 'utf8'));
  m.tablas['core.match'].fichero = join(dir, 'no-existe.csv');
  writeFileSync(join(dir, 'manifiesto.json'), JSON.stringify(m));
  assert.equal(verificaManifiesto(dir).fallos.length, 1);
});

test('el orden de carga respeta las claves foráneas', () => {
  assert.ok(ORDEN.indexOf('core.season') < ORDEN.indexOf('core.match'));
  assert.ok(ORDEN.indexOf('core.team_entry') < ORDEN.indexOf('core.match'));
  assert.ok(ORDEN.indexOf('core.match') < ORDEN.indexOf('core.appearance'));
});
