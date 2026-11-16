/*
 * Prueba del comando de estado por federación (`estado-federaciones.sh`).
 *
 * Se ejecuta de verdad el guion, pero con un `docker` de mentira en el PATH y un árbol de carpetas temporal:
 * así se comprueba lo que importa —el reparto de filas, las dos excepciones de nombre y la antigüedad de la
 * última ingesta— sin tocar el servidor ni la base.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const GUION = resolve(AQUI, 'estado-federaciones.sh');

/** Crea un árbol falso: dos federaciones, una trabajando y otra parada hace 3 h. */
function prepara() {
  const raiz = mkdtempSync(join(tmpdir(), 'estado-fed-'));
  const bin = join(raiz, 'bin');
  mkdirSync(bin, { recursive: true });

  const logClm = join(raiz, 'descargas-castilla-la-mancha', 'recolector-local', 'worker-programado.log');
  const logCyl = join(raiz, 'descargas-federacion', 'recolector-local', 'worker-programado.log');
  mkdirSync(dirname(logClm), { recursive: true });
  mkdirSync(dirname(logCyl), { recursive: true });
  writeFileSync(logClm, 'trabajando\n');
  writeFileSync(logCyl, 'parada\n');

  const ahora = Date.now() / 1000;
  utimesSync(logClm, ahora, ahora);
  utimesSync(logCyl, ahora - 3 * 3600, ahora - 3 * 3600);

  // `docker` de mentira: contesta a las dos llamadas que hace el guion.
  const docker = join(bin, 'docker');
  writeFileSync(docker, `#!/usr/bin/env bash
if [ "$1" = "exec" ]; then
  printf 'castilla-la-mancha|1234\\ncastilla-leon|567\\n'
  exit 0
fi
if [ "$1" = "ps" ]; then
  printf 'facylf-castilla-la-mancha-1|running\\nfacylf-federacion-1|exited\\n'
  exit 0
fi
exit 0
`);
  chmodSync(docker, 0o755);
  return { raiz, bin };
}

function ejecuta(entorno) {
  const r = spawnSync('bash', [GUION], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${entorno.bin}:${process.env.PATH}`, FACYLF_RAIZ: entorno.raiz, FACYLF_AVISO_MIN: '90' },
  });
  return { ...r, texto: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

test('una federación por línea, con sus filas y su contenedor', () => {
  const salida = ejecuta(prepara());
  assert.equal(salida.status, 0, salida.texto);
  const lineas = salida.stdout.split('\n');

  const clm = lineas.find((l) => l.startsWith('castilla-la-mancha'));
  assert.ok(clm, 'falta la línea de castilla-la-mancha:\n' + salida.stdout);
  assert.match(clm, /1[.]?234/, 'las filas deben salir: ' + clm);
  assert.match(clm, /facylf-castilla-la-mancha-1/);
  assert.match(clm, /arriba/);

  // Castilla y León NO se llama como su carpeta: contenedor «federacion» y carpeta «descargas-federacion».
  const cyl = lineas.find((l) => l.startsWith('castilla-leon'));
  assert.ok(cyl, 'falta la línea de castilla-leon:\n' + salida.stdout);
  assert.match(cyl, /facylf-federacion-1/, 'CyL usa el contenedor federacion: ' + cyl);
  assert.match(cyl, /567/);
  assert.match(cyl, /parado/);
  assert.match(cyl, /hace 3 h/, 'la antigüedad de la ingesta se calcula del registro: ' + cyl);
});

test('el total suma partidos y distingue quién está ingiriendo', () => {
  const salida = ejecuta(prepara());
  assert.match(salida.texto, /TOTAL:/, salida.texto);
  assert.match(salida.texto, /2 federaciones/, salida.texto);
  assert.match(salida.texto, /1 contenedores arriba/, salida.texto);
  assert.match(salida.texto, /1 con ingesta en los últimos 90 min/, salida.texto);
});

test('si la base no contesta, falla con un mensaje y no inventa filas', () => {
  const entorno = prepara();
  writeFileSync(
    join(entorno.bin, 'docker'),
    '#!/usr/bin/env bash\nif [ "$1" = "exec" ]; then echo "connection refused" >&2; exit 1; fi\nexit 0\n',
  );
  chmodSync(join(entorno.bin, 'docker'), 0o755);
  const salida = ejecuta(entorno);
  assert.equal(salida.status, 1, salida.texto);
  assert.doesNotMatch(salida.stdout, /castilla-la-mancha .*\d{3}/, 'no debe imprimir filas inventadas');
});

/*
 * El atasco que no se ve: contenedor ARRIBA y sin escribir desde hace más de 10 minutos. Pasó el 16/11/2026
 * con los recolectores esperando un DNS que no resolvía. Tiene que salir en el comando y en el AVISO.
 */
test('un contenedor arriba con la ingesta parada sale marcado y cuenta como atascado', () => {
  const entorno = prepara();
  const ahora = Date.now() / 1000;
  const log = join(entorno.raiz, 'descargas-castilla-la-mancha', 'recolector-local', 'worker-programado.log');
  utimesSync(log, ahora - 45 * 60, ahora - 45 * 60);
  const salida = ejecuta(entorno);
  assert.equal(salida.status, 0, salida.texto);
  const fila = salida.stdout.split('\n').find((l) => l.startsWith('castilla-la-mancha'));
  assert.match(fila, /sin ingesta/, 'la línea debe avisar: ' + fila);
  assert.match(salida.stdout, /AVISO: 1 recolector/, salida.stdout);
});
