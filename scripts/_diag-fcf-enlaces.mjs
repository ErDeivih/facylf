#!/usr/bin/env node
/** Busca en el HTML de un grupo de la FCF los enlaces y marcas que llevan a los datos. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', 'grupos-html');
const archivo = process.argv[2] ?? join(carpeta, readdirSync(carpeta)[0]);
const h = readFileSync(archivo, 'utf8');
console.log(archivo, '·', h.length, 'B\n');

for (const patron of ['alineacions', 'acta', 'partit', 'jornada', 'resultat', 'classificaci', 'calendari', 'equip', 'grupId']) {
  const re = new RegExp(patron, 'gi');
  const n = (h.match(re) || []).length;
  console.log(`${patron}: ${n}`);
}

console.log('\n-- enlaces con datos (partit/acta/alineacions/equip/jornada) --');
const enlaces = [...new Set([...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => /partit|acta|alineacion|equip|jornada|resultat|classific/i.test(u)))];
console.log(JSON.stringify(enlaces.slice(0, 40), null, 1));

console.log('\n-- fragmentos alrededor de «alineacions» --');
for (const m of h.matchAll(/alineacions[^"']{0,160}/g)) console.log('  ', m[0].slice(0, 180));

console.log('\n-- fragmentos alrededor de «partit» --');
let vistas = 0;
for (const m of h.matchAll(/.{80}partit.{120}/gi)) {
  console.log('  ', m[0].replace(/\s+/g, ' ').slice(0, 220));
  if (++vistas >= 8) break;
}

console.log('\n-- texto visible desde «Portal de competicions» --');
const texto = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .split('\n').map((l) => l.trim()).filter(Boolean);
const i = texto.findIndex((l) => /Portal de competicions/.test(l));
console.log(JSON.stringify(texto.slice(i, i + 90), null, 1).slice(0, 3000));
