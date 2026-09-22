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
 *   node scripts/servidor/copiar-datos.mjs --solo estado        # cola + catálogo + estado, sin el archivo
 *   node scripts/servidor/copiar-datos.mjs --seco               # dice qué haría, sin copiar
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';

import { listaDeEstado, veredictoDeIntegridad, decisionDeCopia } from '../lib/copia-estado.mjs';

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');
const SERVIDOR = arg('servidor', 'david@servidor.local');
const DESTINO = arg('destino', '/srv/data/facylf');
const SOLO = arg('solo', 'todo');            // todo | colas | archivo | estado
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
const FORZAR = argumentos.includes('--forzar');
const TMP = join(tmpdir(), 'facylf-copia');
const marcador = (federacion) => `${DESTINO}/.copiado-${federacion}`;
const IMAGEN = arg('imagen', 'facylf-recolectores:local');

/*
 * ── PROGRAMAS QUE SE EJECUTAN EN EL SERVIDOR ────────────────────────────────────────────────────────────
 *
 * Viajan en base64 para que el intérprete de PowerShell del PC (que ya se ha comido comillas más veces de las
 * que me gustaría contar) no tenga nada que romper: es texto sin comillas ni tuberías.
 */
const enBase64 = (texto) => Buffer.from(texto, 'utf8').toString('base64');

const PROGRAMA_INTEGRIDAD = `
import { DatabaseSync } from 'node:sqlite';const ruta = '/datos/descargas-' + process.argv[2] + '/recolector-local/cola-v2.sqlite';
try {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const integridad = db.prepare('pragma integrity_check').get().integrity_check;
  const peticiones = db.prepare('select count(*) n from peticiones').get().n;
  const pendientes = db.prepare("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").get().n;
  console.log('integridad=' + integridad + '  peticiones=' + peticiones + '  pendientes=' + pendientes);
  db.close();
} catch (error) {
  console.log('NO ABRE: ' + error.message);
}
`;

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
function copiaArbol(federacion, { ficheros = null } = {}) {
  return new Promise((listo, falla) => {
    /*
     * Con `ficheros` (modo `estado`) el tar lleva una lista explícita por la entrada estándar: el catálogo, las
     * temporadas, el inventario de códigos… y NADA del archivo de evidencia (`t11`…`t22`), que es el 99 % del
     * peso. El worker no arranca sin el catálogo, así que esto es lo que hay que enviar primero.
     */
    const parametros = ['-cf', '-'];
    if (ficheros) {
      parametros.push('--files-from=-');
    } else {
      parametros.push(
        '--exclude=perfil-chrome',
        '--exclude=*.log',
        '--exclude=cola-v2.sqlite',
        '--exclude=cola-v2.sqlite-wal',
        '--exclude=cola-v2.sqlite-shm',
        `descargas-${federacion}`,
      );
    }
    const tar = spawn('tar', parametros, { cwd: RAIZ, windowsHide: true });
    const remoto = spawn('ssh', ['-o', 'BatchMode=yes', SERVIDOR,
      `mkdir -p ${DESTINO} && tar -xf - -C ${DESTINO}`], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let error = '';
    remoto.stderr.on('data', (d) => { error += d.toString(); });
    tar.stdout.pipe(remoto.stdin);            // binario, de proceso a proceso: PowerShell no toca nada
    tar.stderr.on('data', (d) => { error += d.toString(); });
    if (ficheros) {
      tar.stdin.end(ficheros.length ? `${ficheros.join('\n')}\n` : '');
    } else {
      tar.stdin.end();
    }
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
      const estado = listaDeEstado(RAIZ, f);
      console.log(`  ${f.padEnd(20)} cola ${mb(statSync(cola).size).padStart(7)} MB · estado ${String(estado.length).padStart(2)} ficheros`
        + `${estado.length ? ` (${estado.map((r) => r.split('/').pop()).join(', ')})` : ''}`);
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

    /*
     * ── Y NO SE COPIA CON EL RECOLECTOR DENTRO ──────────────────────────────────────────────────────────
     *
     * `scp` no renombra el fichero: lo abre y lo reescribe. Con el recolector dentro, éste ve cambiarle las
     * páginas debajo mientras su `-wal` describe la base vieja, y la cola queda ilegible. Pasó con Madrid,
     * Murcia y Valencia (22/09/2026), las tres en bucle de caída con «database disk image is malformed».
     */
    const enMarcha = (await ssh(
      `docker ps --filter name=facylf-${federacion}-1 --format '{{.Names}}'`,
    )).salida.includes(`facylf-${federacion}-1`);
    const decision = decisionDeCopia({ contenedorEnMarcha: enMarcha, forzar: FORZAR });
    if (!decision.copiar) {
      console.log(`\n── ${federacion}\n   SE SALTA: ${decision.motivo}`);
      console.log(`   para pararlo:  ssh ${SERVIDOR} 'docker stop facylf-${federacion}-1'`);
      resumen.push({ federacion, saltada: true, motivo: decision.motivo });
      continue;
    }

    const empezado = Date.now();
    console.log(`\n── ${federacion}`);
    try {
      if (!SOLO_COLA && (SOLO === 'todo' || SOLO === 'archivo' || SOLO === 'estado')) {
        // En modo `estado` sólo viaja la lista corta (catálogo, temporadas, inventario…), no el archivo.
        const ficheros = SOLO === 'estado' ? listaDeEstado(RAIZ, federacion) : null;
        if (ficheros && ficheros.length === 0) {
          console.log('   aviso: no se encontró ningún fichero de estado (¿federación recién creada?)');
        }
        process.stdout.write(ficheros
          ? `   copiando el estado (${ficheros.length} ficheros)... `
          : '   copiando el arbol (cola y perfil excluidos)... ');
        const arbol = await copiaArbol(federacion, { ficheros });
        console.log(arbol.error ? `con avisos: ${arbol.error.slice(0, 160)}` : 'hecho');
      }

      process.stdout.write('   instantanea de la cola y envio... ');
      const instantanea = join(TMP, `cola-${federacion}.sqlite`);
      const tamano = instantaneaDeCola(cola, instantanea);
      /*
       * ── LOS DIARIOS HUÉRFANOS SE APARTAN ANTES DE ESCRIBIR ────────────────────────────────────────────
       *
       * Si el contenedor ya había estado corriendo en el servidor, en la carpeta queda un `cola-v2.sqlite-wal`
       * de SU base. Al llegar la copia, ese diario se aplica a un fichero que no es el suyo y la base queda
       * ilegible («database disk image is malformed», medido con Galicia, Madrid, Valencia y Extremadura el
       * 21/09/2026). Se APARTAN, no se borran: quedan como `.previo-<marca>` para poder volver atrás.
       */
      const marca = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const aparta = `cd ${DESTINO}/descargas-${federacion}/recolector-local 2>/dev/null && `
        + `for s in '' '-wal' '-shm'; do [ -f "cola-v2.sqlite$s" ] && mv -f "cola-v2.sqlite$s" "cola-v2.sqlite.previo-${marca}$s"; done; true`;
      await ssh(aparta);

      const envio = await corre('scp', ['-q', instantanea,
        `${SERVIDOR}:${DESTINO}/descargas-${federacion}/recolector-local/cola-v2.sqlite`]);
      if (envio.codigo !== 0) throw new Error(`scp falló: ${envio.error.slice(0, 200)}`);

      // Verificación 1: el fichero del servidor tiene que pesar lo mismo que la instantánea.
      const comprobacion = await ssh(`stat -c %s ${DESTINO}/descargas-${federacion}/recolector-local/cola-v2.sqlite`);
      const remoto = Number(comprobacion.salida.trim());
      const igual = remoto === tamano;
      console.log(`cola ${mb(tamano)} MB · ${igual ? 'verificada' : `NO CUADRA (servidor ${mb(remoto)} MB)`}`);
      rmSync(instantanea, { force: true });

      /*
       * Verificación 2, la que no puede mentir: ABRIR la cola copiada dentro de la imagen del recolector y
       * pedirle un `integrity_check`. El tamaño igual no basta —fue exactamente el caso de las cuatro
       * federaciones que quedaron ilegibles con el tamaño correcto—, así que si esto falla NO se pone el
       * marcador y la federación se vuelve a copiar.
       */
      process.stdout.write('   comprobando que la base abre y esta integra... ');
      const programa = enBase64(PROGRAMA_INTEGRIDAD);
      const ordenIntegridad = `echo ${programa} | base64 -d > /tmp/verifica-cola-${federacion}.mjs && `
        + `docker run --rm -v ${DESTINO}:/datos -v /tmp/verifica-cola-${federacion}.mjs:/verifica.mjs:ro `
        + `--entrypoint node ${IMAGEN} /verifica.mjs ${federacion} 2>&1 | tail -1`;
      const comprueba = await ssh(ordenIntegridad);
      const veredicto = veredictoDeIntegridad(comprueba.salida);
      console.log(veredicto.ok ? `íntegra (${veredicto.peticiones} peticiones, ${veredicto.pendientes} pendientes)` : `NO VALE: ${veredicto.motivo}`);

      if (igual && veredicto.ok) await ssh(`touch ${marcador(federacion)}`);
      resumen.push({
        federacion,
        colaMb: Number(mb(tamano)),
        segundos: Number(segundos(Date.now() - empezado)),
        verificada: igual,
        integra: veredicto.ok,
        peticiones: veredicto.peticiones,
        pendientes: veredicto.pendientes,
      });
    } catch (error) {
      console.log(`   FALLO: ${error.message.slice(0, 200)}`);
      resumen.push({ federacion, fallo: error.message.slice(0, 200) });
    }
  }

  console.log('\n════════ resumen ════════');
  let totalMb = 0;
  let totalPendientes = 0;
  let fallos = 0;
  for (const r of resumen) {
    if (r.saltada) { console.log(`  ${r.federacion.padEnd(20)} ya estaba (usa --rehacer para repetir)`); continue; }
    if (r.fallo) { console.log(`  ${r.federacion.padEnd(20)} FALLO: ${r.fallo}`); fallos += 1; continue; }
    totalMb += r.colaMb ?? 0;
    totalPendientes += r.pendientes ?? 0;
    console.log(`  ${r.federacion.padEnd(20)} cola ${String(r.colaMb).padStart(6)} MB · ${String(r.segundos).padStart(5)} s · `
      + `${r.verificada ? 'tamaño ok' : 'TAMAÑO NO CUADRA'} · `
      + `${r.integra ? `base íntegra (${r.pendientes} pendientes)` : 'BASE ILEGIBLE'}`);
    if (!r.integra) fallos += 1;
  }
  console.log(`  total de colas copiadas: ${totalMb.toFixed(0)} MB · trabajo pendiente que traen: ${totalPendientes.toLocaleString('es-ES')} · fallos: ${fallos}`);
  process.exit(fallos ? 2 : 0);
}

await main();
