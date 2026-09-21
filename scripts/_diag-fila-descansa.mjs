#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿dónde está la fila «Descansa» dentro de la página de jornada?
 *
 * Hipótesis de la causa: cuando la fila del equipo que descansa aparece ANTES de los partidos, la
 * lectura posicional tomaba su equipo como `local` del partido siguiente. Si el conjunto de jornadas
 * en las que la fila «Descansa» precede a los partidos coincide EXACTAMENTE con las siete jornadas
 * cuyo calendario está mal en la cola, el mecanismo queda demostrado.
 *
 * Uso: node scripts/_diag-fila-descansa.mjs [temporada] [etiqueta] [competicion] [grupo]
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';

const [temporada = '20', etiqueta = '2024-25', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const base = join(resolve(import.meta.dirname, '..'), 'descargas-federacion', 'recolector-local',
  `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
const malas = new Set([8, 9, 23, 33, 34, 36, 37]);

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

console.log('J  · tablas  · con 2 enlaces · con 1 enlace · índice del «Descansa» · ¿antes del primer partido?');
const detectadas = new Set();
for (let n = 1; n <= 38; n++) {
  const html = leer(join(base, 'jornadas', `jornada-${n}.html.gz`));
  if (!html) continue;
  const tablas = parse(html).querySelectorAll('table');
  const conDos = [], conUno = [];
  let descansa = -1;
  for (const [i, t] of tablas.entries()) {
    const enlaces = t.querySelectorAll('a[href*="NFG_VisEquipos"]');
    if (enlaces.length === 2) conDos.push(i);
    if (enlaces.length === 1) conUno.push(i);
    // La fila del equipo que descansa es la tabla de un solo enlace de equipo que además dice
    // «Descansa» en el otro lado.
    if (enlaces.length === 1 && /descansa/i.test(t.text) && descansa < 0) descansa = i;
  }
  const primero = conDos[0] ?? -1;
  const antes = descansa >= 0 && primero >= 0 && descansa < primero;
  if (antes) detectadas.add(n);
  const marca = malas.has(n) ? '⚠' : ' ';
  console.log(`${marca}J${String(n).padStart(2)} · ${String(tablas.length).padStart(3)} tablas · ${conDos.length} con 2 · ${conUno.length} con 1 · `
    + `descansa en índice ${descansa} · primer partido ${primero} · ${antes ? 'SÍ precede' : 'no precede'}`);
}

console.log(`\njornadas donde «Descansa» precede al primer partido: ${[...detectadas].sort((a, b) => a - b).join(', ') || '(ninguna)'}`);
console.log(`jornadas con el calendario mal en la cola:              ${[...malas].sort((a, b) => a - b).join(', ')}`);
const iguales = detectadas.size === malas.size && [...malas].every((n) => detectadas.has(n));
console.log(`\n¿coinciden exactamente? ${iguales ? 'SÍ — el mecanismo queda demostrado' : 'NO'}`);
