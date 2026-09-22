#!/usr/bin/env node
/*
 * ¿CUÁNTO CUESTA ANALIZAR Y GUARDAR UN ACTA?
 *
 * Es la palanca (a) del ritmo: si entre petición y petición el recolector se pasa segundos analizando el HTML y
 * escribiendo en SQLite, ahí hay margen sin tocar la cortesía; si el análisis cuesta milisegundos, el hueco lo
 * manda la cortesía y la palanca (a) no da nada.
 *
 * Se mide con ACTAS REALES del archivo (no con HTML de juguete), separando las tres partes:
 *
 *   1. leer y descomprimir el `.gz` del archivo (disco + zlib);
 *   2. `parseaActa` (CPU: analizar el HTML);
 *   3. guardar en una cola temporal (SQLite: escritura).
 *
 * Uso:
 *   node scripts/servidor/mide-analisis-acta.mjs [cuantas] [federacion]
 */
import { readdirSync, readFileSync, existsSync, mkdtempSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { parseaActa } from '../../packages/ingesta/dist/src/parsers/acta.js';
import { abreBase, guardaActaEstructura, enTransaccion } from '../lib/recolector-local.mjs';

const argumentos = process.argv.slice(2);
const CUANTAS = Number(argumentos[0] ?? 20);
const FEDERACION = argumentos[1] ?? 'andalucia';
const RAIZ = resolve(process.env.FACYLF_RAIZ ?? '.');

/** Busca `.gz` de actas reales en el archivo de una federación. */
function buscaActas(federacion, cuantas) {
  const encontradas = [];
  const base = join(RAIZ, `descargas-${federacion}`, 'recolector-local');
  const pila = [base];
  while (pila.length && encontradas.length < cuantas) {
    const carpeta = pila.pop();
    let entradas;
    try { entradas = readdirSync(carpeta, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      const ruta = join(carpeta, e.name);
      if (e.isDirectory()) { pila.push(ruta); continue; }
      // Las actas son `acta-<codigo>.html.gz`: se descartan los JSON de análisis y las clasificaciones.
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
console.log(`midiendo ${actas.length} actas reales de ${FEDERACION}\n`);

const colaTemporal = join(mkdtempSync(join(tmpdir(), 'mide-acta-')), 'cola.sqlite');
const db = abreBase(colaTemporal);

const tiempos = { leer: [], analizar: [], guardar: [] };
let bytes = 0;
let filas = 0;

for (const ruta of actas) {
  let t = process.hrtime.bigint();
  const comprimido = readFileSync(ruta);
  const html = gunzipSync(comprimido).toString('utf8');
  tiempos.leer.push(Number(process.hrtime.bigint() - t) / 1e6);
  bytes += statSync(ruta).size;

  t = process.hrtime.bigint();
  const parseada = parseaActa(html);
  tiempos.analizar.push(Number(process.hrtime.bigint() - t) / 1e6);

  t = process.hrtime.bigint();
  try {
    enTransaccion(db, () => {
      guardaActaEstructura(db, `prueba-${Math.random().toString(36).slice(2, 10)}`, { codigo: '0' }, parseada);
    });
  } catch (error) {
    console.error(`  (aviso al guardar: ${error.message.slice(0, 80)})`);
  }
  tiempos.guardar.push(Number(process.hrtime.bigint() - t) / 1e6);
  filas += 1;
}
db.close();

const resumen = (lista) => {
  const orden = [...lista].sort((a, b) => a - b);
  const suma = orden.reduce((a, b) => a + b, 0);
  return {
    media: suma / orden.length,
    mediana: orden[Math.floor(orden.length / 2)],
    p95: orden[Math.min(orden.length - 1, Math.floor(0.95 * orden.length))],
    max: orden[orden.length - 1],
    total: suma,
  };
};

const f = (n) => n.toFixed(1).padStart(7);
console.log('  fase            media    mediana      p95      max     total');
let sumaTotal = 0;
for (const [nombre, lista] of Object.entries(tiempos)) {
  const r = resumen(lista);
  sumaTotal += r.total;
  console.log(`  ${nombre.padEnd(14)} ${f(r.media)}  ${f(r.mediana)}  ${f(r.p95)}  ${f(r.max)}  ${f(r.total)}`);
}
console.log(`\n  por acta: ${(sumaTotal / filas).toFixed(1)} ms de CPU (${filas} actas, ${(bytes / 1024 / 1024).toFixed(1)} MB comprimidos)`);
console.log(`  si el hueco entre peticiones es de ~10 s, el análisis y el guardado son el `
  + `${(100 * (sumaTotal / filas) / 10_000).toFixed(1)} % de ese hueco.`);
