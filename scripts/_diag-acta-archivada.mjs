#!/usr/bin/env node
/**
 * Mira qué tiene el HTML archivado de un acta que el parser no entiende, y qué ve el propio
 * analizador. Sin red: usa el fichero ya guardado.
 *
 * Uso: node scripts/_diag-acta-archivada.mjs <federacion> <codigo-acta>
 */
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo, inspeccionaActa } from './lib/recolector-local.mjs';

const [fed, codigo] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const a = db.prepare(`select temporada, competicion, grupo, jornada, estado, archivo, incidencias,
    version_parser, calidad from actas where codigo=?`).get(codigo);
console.log('acta:', a);
if (a) {
  const c = db.prepare(`select nombre from competiciones where codigo=? limit 1`).get(a.competicion);
  console.log('competición:', c?.nombre);
}
db.close();
if (!a?.archivo) process.exit(0);

const html = leeArchivo(a.archivo)?.toString('utf8');
if (!html) { console.log('no se pudo leer el archivo', a.archivo); process.exit(0); }
console.log(`\nHTML archivado: ${html.length} caracteres`);
console.log('inspeccionaActa →', JSON.stringify(inspeccionaActa(html)));

const limpio = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
console.log(`\ntexto visible (${limpio.length} caracteres):\n${limpio.slice(0, 1200)}`);
for (const marca of ['Ficha Partido', 'Fitxa', 'Titular', 'Titularrak', 'Suplente', 'Ordezko', 'Alineaci', 'Goles', 'Golak', 'jugador=', 'Árbitro', 'Epailea', 'Entrenador', 'cookie']) {
  const n = html.split(marca).length - 1;
  if (n) console.log(`   "${marca}": ${n}`);
}
