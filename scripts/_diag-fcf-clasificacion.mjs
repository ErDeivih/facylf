#!/usr/bin/env node
/** Muestra la estructura real de la tabla de clasificación de la FCF (celdas y cabeceras). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
const h = readFileSync(join(carpeta, 'vista-classificaci.html'), 'utf8');
const tabla = h.match(/<table[\s\S]*?<\/table>/)[0];
const filas = [...tabla.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((f) => f[0]);
console.log(`filas: ${filas.length}\n`);
for (const f of filas.slice(0, 3)) {
  const celdas = [...f.matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((c) => c[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
  console.log(JSON.stringify(celdas));
}
console.log('\n--- una fila completa de datos (HTML recortado) ---');
const fila = filas[1];
console.log(fila.replace(/\s+/g, ' ').slice(0, 2000));
