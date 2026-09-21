#!/usr/bin/env node
/** Inspecciona un archivo guardado (plano o .gz) y resume qué contiene. Sólo lectura. */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const ruta = process.argv[2];
if (!ruta) throw new Error('Uso: node scripts/_diag-ver-archivo.mjs <ruta.html[.gz]>');
const real = existsSync(ruta) ? ruta : `${ruta}.gz`;
if (!existsSync(real)) throw new Error(`No existe: ${ruta} ni ${ruta}.gz`);
const bruto = readFileSync(real);
const texto = real.endsWith('.gz') ? gunzipSync(bruto).toString('utf8') : bruto.toString('utf8');
console.log(`== ${real}  (${texto.length} caracteres)`);

const limpio = texto
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
console.log(`-- texto visible (${limpio.length} caracteres) --`);
console.log(limpio.slice(0, 1500));
console.log('\n-- marcas buscadas --');
for (const marca of [
  'alineacion',
  'Alineación',
  'arbitro',
  'Árbitro',
  'goles',
  'Goles',
  'titular',
  'suplente',
  'No disponible',
  'no disponible',
  'sin datos',
  'acta',
  'Acta',
  'jugador',
  'entrenador',
]) {
  const n = texto.split(marca).length - 1;
  if (n) console.log(`  "${marca}": ${n}`);
}
console.log('\n-- primeros 700 caracteres crudos --');
console.log(texto.slice(0, 700));
