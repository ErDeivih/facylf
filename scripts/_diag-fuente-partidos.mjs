#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿de qué página salió cada fila de `partidos`?
 *
 * Compara tres fuentes para cada jornada del grupo:
 *   1. `partidos` de la cola (lo que el importador lee),
 *   2. `jornadas/jornada-N.html.gz` (la página de jornada archivada),
 *   3. `calendario.html.gz` (la página de calendario completo archivada).
 *
 * Si (2) y (3) coinciden entre sí y difieren de (1), la cola está obsoleta. Si (3) difiere de (2),
 * el culpable es cómo se lee el calendario.
 *
 * Uso: node scripts/_diag-fuente-partidos.mjs [temporada] [etiqueta] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { extraePartidos } from './lib/recolector-local.mjs';

const [temporada = '20', etiqueta = '2024-25', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-federacion', 'recolector-local', `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const filasCola = db.prepare(`select jornada, orden, local, visitante from partidos
  where temporada = ? and competicion = ? and grupo = ? order by jornada, orden`).all(temporada, competicion, grupo);

const porJornada = (filas) => {
  const m = new Map();
  for (const f of filas) { if (!m.has(f.jornada)) m.set(f.jornada, []); m.get(f.jornada).push(f); }
  return m;
};
const cola = porJornada(filasCola);

/* La página de calendario trae TODAS las jornadas: hay que separarlas por el encabezado «Jornada N». */
function jornadasDelCalendario(html) {
  const filas = extraePartidos(html);
  return filas;
}

const leer = (ruta) => { try { return gunzipSync(readFileSync(ruta)).toString('utf8'); } catch { return null; } };
const clavePar = (f) => `${f.local} || ${f.visitante}`;
const firma = (filas) => filas.map(clavePar).sort().join('\n');

const htmlCalendario = leer(join(base, 'calendario.html.gz'));
const filasCalendario = htmlCalendario ? jornadasDelCalendario(htmlCalendario) : [];
console.log(`calendario.html.gz: ${filasCalendario.length} partidos extraídos`);

/* ¿El calendario viene en orden de jornada? Se reparte por bloques de 9 (grupo de 19 equipos). */
const porJornadaCalendario = new Map();
if (filasCalendario.length) {
  const partidosPorJornada = cola.get(1)?.length ?? 9;
  for (let i = 0; i < filasCalendario.length; i += partidosPorJornada) {
    porJornadaCalendario.set(Math.floor(i / partidosPorJornada) + 1, filasCalendario.slice(i, i + partidosPorJornada));
  }
  console.log(`  repartidos en ${porJornadaCalendario.size} bloques de ${partidosPorJornada}`);
}

let difHtml = 0, difCal = 0;
for (const [jornada, deCola] of [...cola.entries()].sort((a, b) => a[0] - b[0])) {
  const html = leer(join(base, 'jornadas', `jornada-${jornada}.html.gz`));
  const deHtml = html ? extraePartidos(html) : [];
  const deCal = porJornadaCalendario.get(jornada) ?? [];
  const fCola = firma(deCola), fHtml = firma(deHtml), fCal = firma(deCal);
  const marcas = [];
  if (deHtml.length && fCola !== fHtml) { marcas.push('cola≠html-jornada'); difHtml++; }
  if (deCal.length && fCola !== fCal) { marcas.push('cola≠html-calendario'); difCal++; }
  if (deHtml.length && deCal.length && fHtml !== fCal) marcas.push('html-jornada≠html-calendario');
  if (!marcas.length) continue;
  console.log(`\nJ${jornada}: ${marcas.join(' · ')}`);
  const solo = (a, b) => a.filter((x) => !b.includes(x));
  for (const x of solo(fCola.split('\n'), fHtml.split('\n'))) console.log(`    cola:     ${x}`);
  for (const x of solo(fHtml.split('\n'), fCola.split('\n'))) console.log(`    jornada:  ${x}`);
  for (const x of solo(fCal.split('\n'), fCola.split('\n'))) console.log(`    calend.:  ${x}`);
}
console.log(`\njornadas con cola≠página de jornada: ${difHtml} · cola≠calendario: ${difCal}`);
db.close();
