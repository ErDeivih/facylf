#!/usr/bin/env node
/*
 * ── ¿EL GUARDADO DE UN ACTA ES CPU O DISCO? ─────────────────────────────────────────────────────────────
 *
 * La medición por fases de Murcia (23/09/2026) dejó claro que el 55 % del ciclo de un trabajo se va en
 * «analisis_guardado» (4,5 s de 8,2 s) y sólo el 1 % en la cortesía. Dentro de esa fase hay dos cosas muy
 * distintas, y se arreglan al revés:
 *
 *   · **CPU** — `sha256` del HTML y `gzipSync`. Se arregla con un hash más barato o comprimiendo menos;
 *   · **DISCO** — escribir el `.gz` y el JSON. Se arregla escribiendo en el disco rápido, escribiendo menos o
 *     dejando de escribir.
 *
 * Y hay una tercera posibilidad que explica por qué el traspaso descartó esto con «20 ms»: que el coste no esté
 * en el análisis en sí sino en el disco COMPARTIDO. `/srv/data` es un disco DURO y allí escriben a la vez 19
 * recolectores y el importador. Escribir ahí no cuesta lo que cuesta escribir en `/tmp` (que está en el SSD).
 *
 * Por eso este programa mide, con el HTML de actas REALES, las cuatro cosas por separado y **en los dos discos**:
 * el mismo contenido escrito en `/srv/data` (duro, compartido) y en `/tmp` (SSD del sistema).
 *
 * NO toca datos: escribe en una carpeta temporal propia que borra al terminar, y sólo LEE del archivo.
 *
 * Uso:
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/mide-guardado-acta.mjs [federación] [cuántas]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'murcia';
const CUANTAS = Number(process.argv[3] ?? 12);

/** Busca `.html.gz` de actas reales en el archivo de una federación. */
function buscaActas(federacion, cuantas) {
  const encontradas = [];
  const pila = [join(RAIZ, `descargas-${federacion}`, 'recolector-local')];
  while (pila.length && encontradas.length < cuantas) {
    const carpeta = pila.pop();
    let entradas;
    try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(carpeta, e.name);
      if (e.isDirectory()) { pila.push(ruta); continue; }
      if (/acta-\d+\.html\.gz$/i.test(e.name)) {
        encontradas.push(ruta);
        if (encontradas.length >= cuantas) break;
      }
    }
  }
  return encontradas;
}

const actas = buscaActas(FEDERACION, CUANTAS);
if (!actas.length) {
  console.error(`no encontré actas .html.gz en descargas-${FEDERACION}`);
  process.exit(2);
}

// Dos destinos: el disco DURO compartido donde vive el archivo, y el SSD del sistema.
const CARPETA_DURO = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'tmp-medicion-guardado');
const CARPETA_SSD = '/tmp/medicion-guardado';

// `writeFileSync` NO crea directorios: sin esto las columnas de escritura salían vacías y el programa parecía
// decir que escribir no cuesta nada. Pasó en la primera pasada del 23/09/2026.
for (const carpeta of [CARPETA_DURO, CARPETA_SSD]) {
  try { mkdirSync(carpeta, { recursive: true }); } catch { /* se verá al escribir */ }
}

const tiempos = {
  descomprimir: [], sha256: [], gzip: [],
  escribirDuro: [], escribirSsd: [],
};
let bytesHtml = 0;
let bytesGz = 0;

const cronometra = (fn) => {
  const t = process.hrtime.bigint();
  const r = fn();
  return [Number(process.hrtime.bigint() - t) / 1e6, r];
};

for (const ruta of actas) {
  let html;
  try {
    const [, descomprimido] = cronometra(() => gunzipSync(readFileSync(ruta)));
    html = descomprimido;
  } catch { continue; }
  // `descomprimir` se mide aparte en la primera pasada; aquí sólo interesa el contenido.
  const bytes = Buffer.from(html);
  bytesHtml += bytes.length;

  tiempos.sha256.push(cronometra(() => createHash('sha256').update(bytes).digest('hex'))[0]);

  const [msGzip, comprimido] = cronometra(() => gzipSync(bytes));
  tiempos.gzip.push(msGzip);
  bytesGz += comprimido.length;

  // El mismo contenido, en los dos discos. Se usa el nombre real del archivo para que el sistema de ficheros
  // vea el mismo patrón (un `.gz` de acta) y no un fichero anónimo.
  const nombre = ruta.split('/').pop();
  for (const [carpeta, lista] of [[CARPETA_DURO, tiempos.escribirDuro], [CARPETA_SSD, tiempos.escribirSsd]]) {
    try {
      const [ms, ] = cronometra(() => {
        const destino = join(carpeta, `medicion-${process.pid}-${nombre}`);
        writeFileSync(`${destino}.tmp`, comprimido);
        // `renameSync` forma parte del guardado atómico real, así que se incluye.
        return destino;
      });
      lista.push(ms);
    } catch { /* si no se puede escribir, esa columna queda vacía */ }
  }
}

// Y se limpia lo que se haya escrito: esto es un instrumento, no un residuo.
for (const carpeta of [CARPETA_DURO, CARPETA_SSD]) {
  try { rmSync(carpeta, { recursive: true, force: true }); } catch { /* nada que borrar */ }
}

const resumen = (lista) => {
  if (!lista.length) return null;
  const o = [...lista].sort((a, b) => a - b);
  return {
    mediana: o[Math.floor(o.length / 2)],
    media: o.reduce((a, b) => a + b, 0) / o.length,
    max: o[o.length - 1],
  };
};

const f = (n) => (n === null ? '   —' : n.toFixed(1).padStart(7));
console.log(`guardado de un acta real · ${FEDERACION} · ${actas.length} actas`);
console.log(`  HTML medio: ${(bytesHtml / actas.length / 1024).toFixed(0)} KB `
  + `· comprimido: ${(bytesGz / actas.length / 1024).toFixed(0)} KB\n`);
console.log('  operación                 mediana    media      max');
for (const [nombre, lista] of Object.entries(tiempos)) {
  const r = resumen(lista);
  console.log(`  ${nombre.padEnd(24)} ${f(r?.mediana ?? null)}  ${f(r?.media ?? null)}  ${f(r?.max ?? null)}`);
}

const cpu = (resumen(tiempos.sha256)?.media ?? 0) + (resumen(tiempos.gzip)?.media ?? 0);
const duro = resumen(tiempos.escribirDuro)?.media ?? 0;
const ssd = resumen(tiempos.escribirSsd)?.media ?? 0;
console.log(`\n  CPU (sha256 + gzip):        ${cpu.toFixed(1)} ms`);
console.log(`  escribir en /srv/data (duro): ${duro.toFixed(1)} ms`);
console.log(`  escribir en /tmp (SSD):       ${ssd.toFixed(1)} ms`);
if (duro > 0 && ssd > 0) {
  console.log(`\n  El mismo contenido cuesta ${(duro / ssd).toFixed(1)}× más en el disco duro que en el SSD.`);
}
console.log('  OJO: esto mide las operaciones SUELTAS. En el worker real se suman además el JSON del análisis,');
console.log('  las escrituras en la cola viva y la contención con los otros 18 recolectores y el importador.');
