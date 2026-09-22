#!/usr/bin/env node
/*
 * Exporta los INICIOS de petición de cada federación en una ventana, una línea por petición
 * («federacion,iniciada_en»). Es la materia prima de `analiza-cpu-muestras.mjs`, que cruza estos instantes con
 * las muestras de procesador para separar el gasto fijo del navegador del coste de cada página.
 *
 * Uso: node exporta-peticiones.mjs <desdeISO> <hastaISO>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [desde, hasta] = process.argv.slice(2);
if (!desde || !hasta) {
  console.error('uso: exporta-peticiones.mjs <desdeISO> <hastaISO>');
  process.exit(2);
}

const federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
  .sort();

for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
    const filas = db.prepare('select iniciada_en from peticiones where iniciada_en >= ? and iniciada_en < ?')
      .all(desde, hasta);
    for (const f of filas) console.log(`${federacion},${f.iniciada_en}`);
  } catch { /* cola ilegible: se omite */ } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}
