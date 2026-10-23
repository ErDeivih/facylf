#!/usr/bin/env node
/*
 * ── ¿QUEDA ALGO EN EL PC QUE NO ESTÉ EN EL SERVIDOR? ───────────────────────────────────────────────────
 *
 * Compara, federación a federación, el tamaño del ARCHIVO (el HTML comprimido de cada acta) en el PC y en el
 * servidor. Es la respuesta a «llévalo todo, por si queda algo aquí»: las colas ya están copiadas y
 * verificadas, pero el archivo es lo que más pesa y lo que el importador LEE como fuente
 * (`Fuente pnfg-html: …/clasificacion.html.gz`), así que una federación cuyo archivo no esté completo no se
 * puede importar entera.
 *
 * Se compara TAMAÑO APARENTE (`du -sb` en el servidor, suma de ficheros aquí) excluyendo en los dos lados lo
 * que no es archivo: el perfil de Chrome, las bases de la cola y los registros. Las diferencias pequeñas son
 * normales (el servidor sigue recolectando actas nuevas mientras se copia); lo que importa es que no falte una
 * barbaridad.
 *
 * Uso:
 *   node scripts/servidor/compara-datos.mjs
 *   node scripts/servidor/compara-datos.mjs --federaciones murcia,rioja
 */
import { readdirSync, existsSync, statSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

/*
 * La salida va por `writeSync` y no por `console.log`: al ejecutar esto desde el arnés, la salida estándar es
 * una tubería y Node la bufferiza, así que las líneas no se ven hasta el final y parece que se ha colgado.
 */
const escribe = (texto) => writeSync(1, `${texto}\n`);

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');
const SERVIDOR = arg('servidor', 'david@servidor.local');
const DESTINO = arg('destino', '/srv/data/facylf');
const PEDIDAS = arg('federaciones', '').split(',').filter(Boolean);

const EXCLUIR = [/perfil-chrome/, /\.sqlite/, /\.log$/];

/** Tamaño aparente del archivo en el PC (suma de ficheros, saltándose lo que no es archivo). */
function tamanoLocal(federacion) {
  const base = join(RAIZ, `descargas-${federacion}`);
  if (!existsSync(base)) return null;
  let total = 0;
  let ficheros = 0;
  const pila = [base];
  while (pila.length) {
    const carpeta = pila.pop();
    let entradas;
    try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(carpeta, e.name);
      if (EXCLUIR.some((re) => re.test(ruta))) continue;
      if (e.isDirectory()) { pila.push(ruta); continue; }
      if (!e.isFile()) continue;
      // El tamaño hay que pedirlo con `statSync`: un `Dirent` NO lo trae (devolvía `undefined` y la columna
      // salía como NaN en la primera prueba de este guion).
      try { total += statSync(ruta).size; ficheros += 1; } catch { /* fichero que se fue mientras leíamos */ }
    }
  }
  return { bytes: total, ficheros };
}

/** Lo mismo, en el servidor, con `du -sb` (que es rápido y no trae 16 GB por la red). */
function tamanoRemoto(federacion) {
  return new Promise((listo) => {
    const orden = `du -sb --exclude=perfil-chrome --exclude='*.sqlite*' --exclude='*.log' `
      + `${DESTINO}/descargas-${federacion} 2>/dev/null | cut -f1`;
    const hijo = spawn('ssh', ['-o', 'BatchMode=yes', SERVIDOR, orden], { windowsHide: true });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d.toString(); });
    hijo.on('close', () => listo(Number(salida.trim()) || null));
    hijo.on('error', () => listo(null));
  });
}

const mb = (b) => (b === null ? '—' : (b / 1024 ** 2).toFixed(0));

let federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo') && f !== 'federacion-sondeo');
if (PEDIDAS.length) federaciones = federaciones.filter((f) => PEDIDAS.includes(f));
federaciones.sort();

escribe(`comparando el archivo de ${federaciones.length} federaciones · origen ${RAIZ} · destino ${SERVIDOR}:${DESTINO}\n`);
escribe('  federación              PC (MB)   servidor (MB)      falta   veredicto');

const faltan = [];
for (const f of federaciones) {
  const local = tamanoLocal(f);
  const remoto = await tamanoRemoto(f);
  if (!local) { escribe(`  ${f.padEnd(22)} no existe en el PC`); continue; }
  const faltaBytes = remoto === null ? local.bytes : Math.max(0, local.bytes - remoto);
  const faltaMb = faltaBytes / 1024 ** 2;
  const veredicto = remoto === null ? 'NO HAY NADA EN EL SERVIDOR'
    : faltaMb <= 5 ? 'completo'
      : faltaMb / (local.bytes / 1024 ** 2) > 0.05 ? 'FALTA ARCHIVO' : 'casi completo';
  escribe(`  ${f.padEnd(22)} ${mb(local.bytes).padStart(8)} ${mb(remoto).padStart(14)} ${mb(faltaBytes).padStart(10)}   ${veredicto}`);
  if (faltaMb > 5) faltan.push({ federacion: f, faltaMb: Number(faltaMb.toFixed(0)) });
}

escribe('');
if (!faltan.length) {
  escribe('no falta archivo en ninguna federación: el servidor tiene todo lo que tiene el PC');
} else {
  escribe(`falta archivo en ${faltan.length} federación(es):`);
  for (const f of faltan) escribe(`  ${f.federacion.padEnd(22)} ${f.faltaMb} MB por copiar`);
  escribe('\n  para copiarlo:  node scripts/servidor/copiar-datos.mjs --solo archivo --rehacer --federaciones '
    + faltan.map((f) => f.federacion).join(','));
}
