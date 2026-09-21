/**
 * Construye el catálogo histórico de competiciones a partir de los HTML que vuelca
 * Selenium (`descargas-federacion/selenium/html-<temp>.html`).
 *
 * Para cada temporada extrae las competiciones (código + nombre) del desplegable de la
 * página de resultados. Escribe `descargas-federacion/competiciones-por-temporada.json`.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { competicionesDeSelect, estructuraDe } from '../src/catalogo.js';

const RAIZ = resolve(import.meta.dirname, '..', '..', '..');
const carpeta = join(RAIZ, 'descargas-federacion', 'selenium');
const salida = join(RAIZ, 'descargas-federacion', 'competiciones-por-temporada.json');

const ficheros = readdirSync(carpeta).filter((f) => /^html-(\d+)\.html$/.test(f));
if (ficheros.length === 0) {
  console.log('No hay html-*.html en descargas-federacion/selenium/. Ejecuta primero: node scripts/selenium-html.mjs 22 18 8 …');
  process.exit(1);
}

const porTemporada: Record<string, { codCompeticion: string; nombre: string; ambito: string }[]> = {};

for (const f of ficheros) {
  const temp = f.match(/^html-(\d+)\.html$/)?.[1]!;
  const html = readFileSync(join(carpeta, f), 'utf8');
  const comps = competicionesDeSelect(html);
  porTemporada[temp] = comps.map((c) => ({
    codCompeticion: c.codCompeticion,
    nombre: c.nombre,
    ambito: estructuraDe(c.nombre).ambito,
  }));
}

const total = Object.values(porTemporada).reduce((n, a) => n + a.length, 0);
writeFileSync(salida, JSON.stringify(porTemporada, null, 2));
console.log(`Guardado en ${salida}`);
console.log(`Temporadas: ${ficheros.length} · Competiciones totales: ${total}`);
for (const [t, comps] of Object.entries(porTemporada).sort((a, b) => Number(b[0]) - Number(a[0]))) {
  console.log(`  · temporada ${t}: ${comps.length} competiciones`);
}
console.log('\nSiguiente paso: para cada competición, obtener sus grupos (endpoint HTTP ya existente).');
