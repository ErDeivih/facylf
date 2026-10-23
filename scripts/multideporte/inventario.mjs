#!/usr/bin/env node
/** Recuento de registros de un adaptador agrupados por un campo del JSON (p. ej. liga, org, sitio, fede).
 *  Uso: node scripts/multideporte/inventario.mjs <adaptador> <tipo> <campo> */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abreCola } from './motor.mjs';
const [ad, tipo, campo] = process.argv.slice(2);
const db = abreCola(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'descargas-multideporte', ad, 'cola.sqlite'));
const filas = db.prepare(`select json_extract(datos, '$.' || ?) k, count(*) n, min(json_extract(datos,'$.fecha')) desde, max(json_extract(datos,'$.fecha')) hasta
  from registros where adaptador=? and tipo=? group by 1 order by 2 desc`).all(campo, ad, tipo);
for (const f of filas) console.log(`${String(f.k).padEnd(28)} ${String(f.n).padStart(7)}  ${f.desde ?? ''} → ${f.hasta ?? ''}`);
