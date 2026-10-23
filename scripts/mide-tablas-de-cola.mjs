#!/usr/bin/env node
/*
 * QUÉ GUARDA CADA COLA, TABLA POR TABLA, Y CUÁNTO — para encontrar lo recolectado que NADIE lee.
 *
 * Por qué. El encargo es que ninguna consulta se apoye en una base incompleta sin saberlo, y una familia de
 * incompletitud que no se había mirado es la más tonta de todas: **una tabla de la cola que el importador no
 * lee**. Nada falla, nada avisa, y esos datos no están en el canónico. Para verlo hay que enfrentar las dos
 * listas: lo que la cola guarda y lo que el importador consume.
 *
 * Esto saca la primera: por cada federación, sus tablas y sus filas (sólo lectura, `timeout` para no chocar
 * con el recolector que está escribiendo).
 *
 * Uso:
 *   node scripts/mide-tablas-de-cola.mjs                 · todas las federaciones
 *   node scripts/mide-tablas-de-cola.mjs --federacion galicia
 *   node scripts/mide-tablas-de-cola.mjs --json
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
const filtro = arg('federacion');
const soloJson = argumentos.includes('--json');

function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    if (entrada.name === 'descargas-federacion-sondeo' || entrada.name === 'descargas-prueba-10gb') continue;
    const ruta = join(RAIZ, entrada.name, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta)) continue;
    if (existsSync(join(RAIZ, entrada.name, '.PRUEBA'))) continue;
    const federacion = entrada.name === 'descargas-federacion' ? 'castilla-leon' : entrada.name.replace('descargas-', '');
    if (filtro && federacion !== filtro) continue;
    salida.push({ federacion, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

/** federación → tabla → filas. */
const porTabla = new Map();
const porFederacion = [];
for (const { federacion, ruta } of colas()) {
  const db = new DatabaseSync(ruta, { readOnly: true, timeout: 10_000 });
  const suyo = {};
  try {
    const tablas = db.prepare("select name from sqlite_master where type = 'table' order by name").all();
    for (const t of tablas) {
      let filas = null;
      try {
        filas = Number(db.prepare(`select count(*) as n from "${t.name}"`).get().n);
      } catch { /* una tabla ilegible se dice, no se salta en silencio */ }
      suyo[t.name] = filas;
      const acumulado = porTabla.get(t.name) ?? { federaciones: 0, filas: 0, vacias: 0 };
      acumulado.federaciones += 1;
      acumulado.filas += filas ?? 0;
      if (filas === 0) acumulado.vacias += 1;
      porTabla.set(t.name, acumulado);
    }
  } finally {
    db.close();
  }
  porFederacion.push({ federacion, tablas: suyo });
}

if (soloJson) {
  console.log(JSON.stringify({ porFederacion, porTabla: Object.fromEntries(porTabla) }, null, 2));
  process.exit(0);
}

console.log(`═══ qué guarda cada cola · ${porFederacion.length} cola(s)`);
console.log('');
console.log(`  ${'tabla'.padEnd(28)} ${'filas'.padStart(12)} ${'en colas'.padStart(9)} ${'vacías'.padStart(8)}`);
for (const [tabla, c] of [...porTabla].sort((a, b) => b[1].filas - a[1].filas)) {
  console.log(`  ${tabla.padEnd(28)} ${String(c.filas).padStart(12)} ${String(c.federaciones).padStart(9)} ${String(c.vacias).padStart(8)}`);
}
console.log('');
console.log('  (sólo se cuentan las tablas que existen en cada cola; una tabla ausente no es una tabla vacía)');
if (filtro) {
  const suya = porFederacion[0];
  console.log(`\n  ${suya.federacion}, tabla a tabla:`);
  for (const [tabla, filas] of Object.entries(suya.tablas).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))) {
    console.log(`    ${tabla.padEnd(28)} ${String(filas).padStart(12)}`);
  }
}
