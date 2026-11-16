/*
 * Prueba de `arranque-escalonado.sh`: un `docker` de mentira apunta cada orden y un fichero hace de
 * `/proc/loadavg`. Se comprueba el orden (Castilla y León primero), que se para todo antes de arrancar y
 * que con la carga por encima del umbral NO se arranca el resto (que es lo que provocó la carga de 19,80).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUION = resolve(dirname(fileURLToPath(import.meta.url)), 'arranque-escalonado.sh');

function monta({ carga = '0.80', nombres = ['facylf-aragon-1', 'facylf-federacion-1', 'facylf-postgres', 'facylf-web'] } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'arranque-'));
  const bin = join(base, 'bin');
  mkdirSync(bin, { recursive: true });
  const registro = join(base, 'ordenes.log');
  writeFileSync(registro, '');
  const loadavg = join(base, 'loadavg');
  writeFileSync(loadavg, `${carga} 0.50 0.40 1/100 1234\n`);

  const docker = join(bin, 'docker');
  writeFileSync(docker, `#!/usr/bin/env bash
if [ "$1" = "ps" ]; then
  printf '%s\\n' ${nombres.map((n) => `'${n}'`).join(' ')}
  exit 0
fi
echo "$*" >> "${registro}"
exit 0
`);
  chmodSync(docker, 0o755);
  return { bin, registro, loadavg };
}

function ejecuta(entorno, extra = {}) {
  const r = spawnSync('bash', [GUION], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${entorno.bin}:${process.env.PATH}`,
      FACYLF_LOADAVG: entorno.loadavg,
      FACYLF_RETRASO: '0',
      FACYLF_ESPERA_MAX: '0',
      ...extra,
    },
  });
  return { ...r, texto: `${r.stdout ?? ''}${r.stderr ?? ''}`, ordenes: readFileSync(entorno.registro, 'utf8').trim().split('\n').filter(Boolean) };
}

test('para todos antes de arrancar y empieza por Castilla y León', () => {
  const r = ejecuta(monta());
  assert.equal(r.status, 0, r.texto);
  const nombre = (o) => o.split(' ').pop();
  const arranques = r.ordenes.filter((o) => o.startsWith('start ')).map(nombre);
  assert.deepEqual(arranques, ['facylf-federacion-1', 'facylf-aragon-1'], 'CyL primero y luego alfabético: ' + r.texto);
  const paradas = r.ordenes.filter((o) => o.startsWith('stop ')).map(nombre);
  assert.deepEqual(paradas.sort(), ['facylf-aragon-1', 'facylf-federacion-1'], 'se paran los dos');
  // La base y la web no son recolectores: no se tocan.
  assert.ok(!r.ordenes.some((o) => o.includes('facylf-postgres') || o.includes('facylf-web')), r.texto);
});

test('con la carga por encima del umbral no arranca (y lo dice)', () => {
  const r = ejecuta(monta({ carga: '9.50' }));
  assert.equal(r.status, 2, r.texto);
  assert.equal(r.ordenes.filter((o) => o.startsWith('start ')).length, 0, 'no debe arrancar ninguno');
  assert.match(r.texto, /Pendientes: 2/);
  assert.match(r.texto, /umbral|9\.50/);
});

test('sin recolectores termina sin tocar nada', () => {
  const r = ejecuta(monta({ nombres: ['facylf-postgres', 'facylf-web'] }));
  assert.equal(r.status, 0, r.texto);
  assert.equal(r.ordenes.length, 0, 'no debe llamar a docker para parar ni arrancar');
  assert.match(r.texto, /No hay recolectores/);
});
