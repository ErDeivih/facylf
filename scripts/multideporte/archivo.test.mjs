import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buscaEvidencia, carpetasEvidencias, raizArchivo } from './archivo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));

test('archivo: sin archivo.json todo sigue en descargas-multideporte/<adaptador>/evidencias', { skip: existsSync(join(AQUI, 'archivo.json')) }, () => {
  assert.equal(raizArchivo(), null);
  const c = carpetasEvidencias('serversports');
  assert.equal(c.length, 1);
  assert.ok(c[0].replace(/\\/g, '/').endsWith('descargas-multideporte/serversports/evidencias'));
  assert.equal(buscaEvidencia('no-existe', 'partido/00/x.gz'), null);
});
