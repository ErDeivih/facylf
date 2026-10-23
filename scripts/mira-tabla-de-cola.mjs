#!/usr/bin/env node
/*
 * MIRA UNA TABLA DE LAS COLAS DE VERDAD: su esquema, sus columnas y unas filas de ejemplo, en las
 * federaciones donde tenga algo.
 *
 * Es el complemento de `scripts/mide-tablas-de-cola.mjs`: allí sale QUE tablas hay y cuántas filas; aquí se
 * mira una para saber qué es y si el importador la lee.
 *
 * Uso: node scripts/mira-tabla-de-cola.mjs --tabla eventos [--filas 5] [--federacion galicia]
 *      node scripts/mira-tabla-de-cola.mjs --tabla actas --donde "codigo = 523909"
 *
 * `--donde` es una condición SQL que se añade al `select` (sólo lectura; la herramienta es para mirar, no
 * para tocar). Sirve para ir a un caso concreto sin escribir un script de un solo uso.
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requerir = createRequire(join(RAIZ, 'packages', 'canonico', 'package.json'));
const { DatabaseSync } = requerir('node:sqlite');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const tabla = arg('tabla');
const limite = Number(arg('filas') ?? 5);
const filtro = arg('federacion');
const donde = arg('donde');
const condicion = donde === null ? '' : ` where ${donde}`;
if (tabla === null) {
  console.error('Falta --tabla <nombre>. Las tablas de las colas se listan con scripts/mide-tablas-de-cola.mjs.');
  process.exit(1);
}

const colas = [];
for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
  const ruta = join(RAIZ, entrada.name, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
  const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
  if (filtro && federacion !== filtro) continue;
  colas.push({ federacion, ruta });
}

let ensenadoEsquema = false;
for (const { federacion, ruta } of colas.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'))) {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  try {
    const existe = db.prepare("select sql from sqlite_master where type = 'table' and name = ?").get(tabla);
    if (existe === undefined) continue;
    const n = Number(db.prepare(`select count(*) as n from "${tabla}"${condicion}`).get().n);
    if (n === 0) continue;
    if (!ensenadoEsquema && donde === null) {
      console.log(`── ${tabla}: esquema (${federacion})\n${existe.sql}\n`);
      ensenadoEsquema = true;
    }
    console.log(`── ${federacion}: ${n} fila(s)`);
    for (const fila of db.prepare(`select * from "${tabla}"${condicion} limit ${limite}`).all()) {
      const pares = Object.entries(fila).map(([k, v]) => `${k}=${v === null ? 'NULL' : String(v).slice(0, 60)}`);
      console.log(`   ${pares.join(' · ')}`);
    }
  } catch (error) {
    console.log(`   ${federacion}: no se pudo leer (${error.message})`);
  } finally {
    db.close();
  }
}
