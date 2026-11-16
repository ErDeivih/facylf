/*
 * Prueba del resolvedor de nombres de federación (`docker/lib-federacion.sh`).
 *
 * Cubre lo que de verdad puede romper una ingesta: que `castilla-y-leon` acabe en la MISMA carpeta y sin
 * perfil que `federacion` (si no, el supervisor crea una cola vacía y la federación no recoge nada), y que
 * las demás no cambien.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), 'lib-federacion.sh');

function llama(fn, ...args) {
  const r = spawnSync('bash', ['-c', `source "$1"; shift; ${fn} "$@"`, '_', LIB, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}

test('castilla-y-leon y federacion son el mismo recolector', () => {
  assert.equal(llama('carpeta_de_federacion', 'castilla-y-leon'), 'federacion');
  assert.equal(llama('carpeta_de_federacion', 'federacion'), 'federacion');
  assert.equal(llama('federacion_sin_perfil', 'castilla-y-leon'), '1');
  assert.equal(llama('federacion_sin_perfil', 'federacion'), '1');
  assert.equal(llama('codigo_canonico_de_federacion', 'castilla-y-leon'), 'castilla-leon');
});

test('las demás federaciones no cambian de nombre ni de perfil', () => {
  assert.equal(llama('carpeta_de_federacion', 'castilla-la-mancha'), 'castilla-la-mancha');
  assert.equal(llama('federacion_sin_perfil', 'castilla-la-mancha'), '0');
  assert.equal(llama('carpeta_de_federacion', 'aragon'), 'aragon');
  assert.equal(llama('codigo_canonico_de_federacion', 'murcia'), 'murcia');
  // Las que tienen guion propio siguen sin perfil, pero con su carpeta.
  assert.equal(llama('federacion_sin_perfil', 'madrid'), '1');
  assert.equal(llama('carpeta_de_federacion', 'madrid'), 'madrid');
});

test('sin argumento no inventa una carpeta', () => {
  assert.equal(llama('carpeta_de_federacion'), '');
});
