#!/usr/bin/env node
/** Contexto de cada aparición de los nombres de equipo en una ficha de acta guardada. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const archivo = process.argv[2] ?? join(carpeta, readdirSync(carpeta).find((f) => f.startsWith('acta-dom-')));
const h = readFileSync(archivo, 'utf8');
console.log(archivo, '·', h.length, 'B');

for (const nombre of ['JUVENTUS-LLORET FUTBOL CLUB', 'CALDES MONTBUI, C.F.']) {
  console.log(`\n########## «${nombre}»`);
  let i = -1; let n = 0;
  while ((i = h.indexOf(nombre, i + 1)) !== -1 && n < 8) {
    n += 1;
    const antes = h.slice(Math.max(0, i - 260), i).replace(/\s+/g, ' ');
    console.log(`  ${n}) …${antes}`);
  }
  console.log(`  total apariciones: ${h.split(nombre).length - 1}`);
}
