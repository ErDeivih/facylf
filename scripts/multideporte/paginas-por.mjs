#!/usr/bin/env node
/** Páginas de la cola agrupadas por un campo del contexto, tipo y estado (con el último error).
 *  Uso: node scripts/multideporte/paginas-por.mjs <adaptador> <campo-contexto> */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abreCola } from './motor.mjs';
const [ad, campo] = process.argv.slice(2);
const db = abreCola(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'descargas-multideporte', ad, 'cola.sqlite'));
for (const f of db.prepare(`select json_extract(contexto, '$.' || ?) k, tipo, estado, count(*) n, max(ultimo_error) e, max(veces) v
  from paginas where adaptador=? group by 1,2,3 order by 1,2,3`).all(campo, ad)) {
  console.log(`${String(f.k).padEnd(26)} ${f.tipo.padEnd(12)} ${f.estado.padEnd(10)} ${String(f.n).padStart(5)} veces≤${f.v} ${f.e ? '· ' + String(f.e).slice(0, 90) : ''}`);
}
