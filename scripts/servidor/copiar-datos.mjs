#!/usr/bin/env node
/*
 * ── COPIAR LOS DATOS DEL PC AL SERVIDOR (lo único irrecuperable) ───────────────────────────────────────
 *
 * Lo que se copia, y por qué:
 *
 *   · **la cola** (`cola-v2.sqlite`) es el estado del trabajo: sin ella el servidor volvería a pedir cientos de
 *     miles de actas ya hechas. Se copia con `VACUUM INTO`, que saca una **instantánea coherente** aunque la
 *     flota esté escribiendo en ese mismo momento (copiar el fichero a pelo, con su `-wal` a medias, puede dar
 *     una base rota: la instantánea no).
 *   · **el HTML archivado y los catálogos** (`t11`…`t22`, `*-por-temporada.json`): son la evidencia y el
 *     descubrimiento hecho; también irremplazables.
 *
 * Lo que NO se copia: el perfil de Chrome (se regenera solo y son GB de caché), los registros de este PC y los
 * ficheros `-wal`/`-shm` (van dentro de la instantánea).
 *
 * Cómo: `tar` por la entrada estándar de `ssh`, escrito desde Node (no por PowerShell, que rompe los binarios) y
 * luego `scp` de la instantánea. Se puede cortar y volver a lanzar: lo ya copiado se salta salvo `--rehacer`.
 *
 * Uso:
 *   node scripts/servidor/copiar-datos.mjs                      # todo, al servidor
 *   node scripts/servidor/copiar-datos.mjs --federaciones murcia,navarra
 *   node scripts/servidor/copiar-datos.mjs --solo colas         # sólo las colas (lo urgente)
 *   node scripts/servidor/copiar-datos.mjs --seco               # dice qué haría, sin copiar
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');
const SERVIDOR = arg('servidor', 'david@servidor.local');
const DESTINO = arg('destino', '/srv/data/facylf');
const SOLO = arg('solo', 'todo');            // todo | colas | archivo
const SECO = argumentos.includes('--seco');
const REHACER = argumentos.includes('--rehacer');
/*
 * `--solo-cola`: copia ÚNICAMENTE la instantánea de la cola, sin el árbol del archivo.
 *
 * Es lo que se usa al TRASPASAR una federación (el árbol ya se copió en la pasada grande y sólo crece): volver
 * a enviar 3 GB de archivo por un cambio de 300 MB de cola era el 90 % del tiempo del traspaso. La cola es el
 * estado del trabajo; el HTML archivado que falte se sincroniza después en una pasada aparte.
 */
const SOLO_COLA = argumentos.includes('--solo-cola');
const TMP = join(tmpdir(), 'facylf-copia');
const marcador = (federacion) => `${DESTINO}/.copiado-${federacion}`;

const mb = (bytes) => (bytes / 1024 ** 2).toFixed(1);
const segundos = (ms) => (ms / 1000).toFixed(0);

/** Ejecuta un comando y espera; devuelve { codigo, salida }. */
function corre(orden, parametros, { entrada = null } = {}) {
  return new Promise((listo, falla) => {
    const hijo = spawn(orden, parametros, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let salida = '';
    let error = '';
    hijo.stdout.on('data', (d) => { salida += d.toString(); });
    hijo.stderr.on('data', (d) => { error += d.toString(); });
    hijo.on('error', falla);
    hijo.on('close', (codigo) => listo({ codigo, salida, error }));
    if (entrada) entrada.pipe(hijo.stdin); else hijo.stdin.end();
  });
}

/** El `ssh` del sistema, con las opciones que ya usa el resto del proyecto. */
const ssh = (ordenRemoto) => corre('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', SERVIDOR, ordenRemoto]);

/**
 * Instantánea coherente de una cola, con `VACUUM INTO`.
 *
 * Es la diferencia entre copiar una base que se está escribiendo y copiar una foto de la base: el `-wal` puede
 * tener transacciones a medias y llevarse el fichero sin él da una base inconsistente.
 */
function instantaneaDeCola(ruta, destino) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    // `VACUUM INTO` escribe un fichero nuevo y compacto; si ya existía, hay que quitarlo antes.
    if (existsSync(destino)) rmSync(destino, { force: true });
    db.exec(`vacuum into '${destino.replace(/\\/g, '/').replace(/'/g, "''")}'`);
    return statSync(destino).size;
  } finally {
    db.close();
  }
}

/** Copia el árbol de una federación por `tar` sobre la entrada estándar de `ssh`. */
function copiaArbol(federacion) {
  return new Promise((listo, falla) => {
    const tar = spawn('tar', [
      '-cf', '-',
      '--exclude=perfil-chrome',
      '--exclude=*.log',
      '--exclude=cola-v2.sqlite',
      '--exclude=cola-v2.sqlite-wal',
      '--exclude=cola-v2.sqlite-shm',
      `descargas-${federacion}`,
    ], { cwd: RAIZ, windowsHide: true });
    const remoto = spawn('ssh', ['-o', 'BatchMode=yes', SERVIDOR,
      `mkdir -p ${DESTINO} && tar -xf - -C ${DESTINO}`], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let error = '';
    remoto.stderr.on('data', (d) => { error += d.toString(); });
    tar.stdout.pipe(remoto.stdin);            // binario, de proceso a proceso: PowerShell no toca nada
    tar.stderr.on('data', (d) => { error += d.toString(); });
    let pendientes = 2;
    const termina = () => { pendientes -= 1; if (pendientes === 0) listo({ error }); };
    tar.on('close', (codigo) => { if (codigo !== 0) error += `tar salió con ${codigo}; `; termina(); });
    remoto.on('close', (codigo) => { if (codigo !== 0) error += `ssh/tar salió con ${codigo}; `; termina(); });
    tar.on('error', falla);
    remoto.on('error', falla);
  });
}

async function main() {
  mkdirSync(TMP, { recursive: true });

  let federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
    .map((n) => n.replace('descargas-', ''))
    .filter((f) => existsSync(join(RAIZ, `descargas-${f}`, 'recolector-local', 'cola-v2.sqlite')));
  const pedidas = arg('federaciones', '');
  if (pedidas) federaciones = federaciones.filter((f) => pedidas.split(',').includes(f));
  federaciones.sort();

  console.log(`copiar datos al servidor · ${federaciones.length} federaciones · modo ${SOLO}`
    + `${SECO ? ' · ENSAYO (no copia nada)' : ''}`);
  console.log(`origen: ${RAIZ}\ndestino: ${SERVIDOR}:${DESTINO}\n`);

  if (SECO) {
    for (const f of federaciones) {
      const cola = join(RAIZ, `descargas-${f}`, 'recolector-local', 'cola-v2.sqlite');
      console.log(`  ${f.padEnd(20)} cola ${mb(statSync(cola).size).padStart(7)} MB`);
    }
    return;
  }

  const resumen = [];
  for (const federacion of federaciones) {
    const carpeta = join(RAIZ, `descargas-${federacion}`, 'recolector-local');
    const cola = join(carpeta, 'cola-v2.sqlite');

    if (!REHACER) {
      const ya = await ssh(`test -f ${marcador(federacion)} && echo SI || echo NO`);
      if (ya.salida.includes('SI')) {
        console.log(`  ${federacion.padEnd(20)} ya estaba copiada (se salta; usa --rehacer para repetir)`);
        resumen.push({ federacion, saltada: true });
        continue;
      }
    }

    const empezado = Date.now();
    console.log(`\n── ${federacion}`);
    try {
      if (!SOLO_COLA && (SOLO === 'todo' || SOLO === 'archivo')) {
        process.stdout.write('   copiando el arbol (cola y perfil excluidos)... ');
        const arbol = await copiaArbol(federacion);
        console.log(arbol.error ? `con avisos: ${arbol.error.slice(0, 160)}` : 'hecho');
      }

      process.stdout.write('   instantanea de la cola y envio... ');
      const instantanea = join(TMP, `cola-${federacion}.sqlite`);
      const tamano = instantaneaDeCola(cola, instantanea);
      const envio = await corre('scp', ['-q', instantanea,
        `${SERVIDOR}:${DESTINO}/descargas-${federacion}/recolector-local/cola-v2.sqlite`]);
      if (envio.codigo !== 0) throw new Error(`scp falló: ${envio.error.slice(0, 200)}`);

      // Verificación: el fichero del servidor tiene que pesar lo mismo que la instantánea.
      const comprobacion = await ssh(`stat -c %s ${DESTINO}/descargas-${federacion}/recolector-local/cola-v2.sqlite`);
      const remoto = Number(comprobacion.salida.trim());
      const igual = remoto === tamano;
      console.log(`cola ${mb(tamano)} MB · ${igual ? 'verificada' : `NO CUADRA (servidor ${mb(remoto)} MB)`}`);
      rmSync(instantanea, { force: true });

      if (igual) await ssh(`touch ${marcador(federacion)}`);
      resumen.push({ federacion, colaMb: Number(mb(tamano)), segundos: Number(segundos(Date.now() - empezado)), verificada: igual });
    } catch (error) {
      console.log(`   FALLO: ${error.message.slice(0, 200)}`);
      resumen.push({ federacion, fallo: error.message.slice(0, 200) });
    }
  }

  console.log('\n════════ resumen ════════');
  let totalMb = 0;
  let fallos = 0;
  for (const r of resumen) {
    if (r.saltada) { console.log(`  ${r.federacion.padEnd(20)} ya estaba`); continue; }
    if (r.fallo) { console.log(`  ${r.federacion.padEnd(20)} FALLO: ${r.fallo}`); fallos += 1; continue; }
    totalMb += r.colaMb ?? 0;
    console.log(`  ${r.federacion.padEnd(20)} cola ${String(r.colaMb).padStart(6)} MB · ${String(r.segundos).padStart(5)} s · `
      + `${r.verificada ? 'verificada' : 'SIN VERIFICAR'}`);
  }
  console.log(`  total de colas copiadas: ${totalMb.toFixed(0)} MB · fallos: ${fallos}`);
  process.exit(fallos ? 2 : 0);
}

await main();
