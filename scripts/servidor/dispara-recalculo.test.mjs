/*
 * Prueba de `dispara-recalculo.mjs`: la clave de unidad que usa el importador y qué colas se miran.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claveUnidad, colas, PREFIJO } from './dispara-recalculo.mjs';

test('la clave de unidad es federacion|temporada|grupo', () => {
  assert.equal(claveUnidad({ temporada: '2026-27', grupo: '24218933' }), `${PREFIJO}|2026-27|24218933`);
});

test('se miran las colas de CyL y sólo ésas', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'colas-'));
  for (const c of ['descargas-federacion', 'descargas-federacion-2', 'descargas-aragon']) {
    mkdirSync(join(raiz, c, 'recolector-local'), { recursive: true });
    writeFileSync(join(raiz, c, 'recolector-local', 'cola-v2.sqlite'), '');
  }
  const encontradas = colas(raiz).map((r) => r.split(/[\\/]/).slice(-3)[0]);
  assert.deepEqual(encontradas.sort(), ['descargas-federacion', 'descargas-federacion-2']);
});
