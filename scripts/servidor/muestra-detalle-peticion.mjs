#!/usr/bin/env node
/*
 * Enseña el DETALLE COMPLETO de las últimas peticiones de una federación (sin recortar).
 *
 * El detalle es donde el recolector escribe lo que vio cuando algo no cuadra: la URL, los botones de la página y
 * un trozo del texto. Recortado a 44 caracteres no dice nada —y es lo que hacen los demás informes—, así que
 * aquí se saca entero para poder distinguir un muro de cookies de un calendario vacío de verdad.
 *
 * SÓLO LEE.
 *
 * Uso: docker exec facylf-monitor node /app/scripts/servidor/muestra-detalle-peticion.mjs <fed> [cuántas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2];
const CUANTAS = Number(process.argv[3] ?? 1);
if (!FEDERACION) {
  console.error('uso: muestra-detalle-peticion.mjs <federación> [cuántas]');
  process.exit(2);
}

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const filas = db.prepare(`select iniciada_en, trabajo, url, resultado, detalle from peticiones
  order by id desc limit ?`).all(CUANTAS);
db.close();

for (const f of filas) {
  console.log(`══ ${f.iniciada_en} · ${f.trabajo}`);
  console.log(`   resultado: ${f.resultado}`);
  console.log(`   url: ${f.url}`);
  console.log('   detalle:');
  // Se parte el detalle en trozos legibles: muchos llevan un JSON con la URL, los botones y el texto.
  const detalle = String(f.detalle ?? '');
  for (const trozo of detalle.split(/(?<=\])\s*/)) {
    console.log(`     ${trozo}`);
  }
  console.log();
}
