#!/usr/bin/env node
/**
 * Extrae el texto de un PDF sin librerías: descomprime sus flujos (FlateDecode) y recoge lo que
 * pintan los operadores de texto (Tj/TJ). Suficiente para documentos generados por una federación.
 *
 * Uso: node scripts/_diag-pdf-texto.mjs <url o ruta> [caracteres]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { inflateSync } from 'node:zlib';

const origen = process.argv[2];
const limite = Number(process.argv[3] ?? 3000);
const datos = origen.startsWith('http')
  ? Buffer.from(await (await fetch(origen, { headers: { 'user-agent': 'FacylfBot/1.0 (proyecto personal)' } })).arrayBuffer())
  : readFileSync(origen);
console.log(`${origen} · ${datos.length} B`);

const carpeta = join(import.meta.dirname, '..', 'descargas-federacion-sondeo', 'muestras-melilla');
mkdirSync(carpeta, { recursive: true });
writeFileSync(join(carpeta, basename(origen.split('?')[0])), datos);

const crudo = datos.toString('latin1');
const textos = [];
let flujos = 0;
for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
  const cuerpo = Buffer.from(m[1], 'latin1');
  let descomprimido = null;
  try { descomprimido = inflateSync(cuerpo); } catch { /* puede no estar comprimido */ }
  if (!descomprimido) continue;
  flujos += 1;
  const texto = descomprimido.toString('latin1');
  // Operadores de texto: (cadena) Tj  y  [(a) -20 (b)] TJ
  for (const t of texto.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\][]|\\.)*\]\s*TJ/g)) {
    const trozos = [...t[0].matchAll(/\(((?:\\.|[^\\()])*)\)/g)].map((x) => x[1]
      .replace(/\\([()\\])/g, '$1').replace(/\\[0-7]{1,3}/g, ' '));
    const linea = trozos.join('');
    if (linea.trim()) textos.push(linea);
  }
}
console.log(`flujos descomprimidos: ${flujos} · líneas de texto: ${textos.length}`);
console.log('\n--- texto (primeros tramos) ---');
console.log(textos.join('\n').slice(0, limite));
