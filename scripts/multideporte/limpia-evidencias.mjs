#!/usr/bin/env node
/**
 * Quita DNI/NIE y correos de las evidencias ya guardadas por los recolectores multideporte (las anteriores al
 * filtro del motor del 01/10/2026). Sólo toca páginas de texto (no PDF) y sólo si había algo que quitar.
 * Uso: node scripts/multideporte/limpia-evidencias.mjs
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync, gzipSync } from 'node:zlib';
import { retiraIdentificadores } from './motor.mjs';
const RAIZ = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'descargas-multideporte');
let revisados = 0; let limpiados = 0;
function recorre(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!/[\\/]acta$/.test(p)) recorre(p); continue; }
    if (!p.endsWith('.gz') || !p.includes('evidencias') || Date.now() - statSync(p).mtimeMs < 60_000) continue;
    const b = gunzipSync(readFileSync(p)); revisados += 1;
    if (b.subarray(0, 4).toString() === '%PDF') continue;
    const t = b.toString('utf8'); const n = retiraIdentificadores(t);
    if (n !== t) { writeFileSync(p, gzipSync(Buffer.from(n))); limpiados += 1; }
  }
}
recorre(RAIZ);
console.log(`evidencias revisadas ${revisados}, limpiadas ${limpiados}`);
