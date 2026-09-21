/*
 * El LITERAL exacto que usa cada cola de iSquad en el lado del descanso, contado. Sólo lee.
 *
 * Sirve para no inventar vocabulario: si la fuente escribe «Descansa» y nada más, el vocabulario lleva eso.
 *
 * Uso: node scripts/_diag-literal-descanso.mjs [madrid valencia euskadi …]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federaciones = process.argv.slice(2).length ? process.argv.slice(2) : ['madrid', 'valencia', 'euskadi'];

for (const federacion of federaciones) {
  const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  let db;
  try { db = new DatabaseSync(ruta, { readOnly: true }); } catch { continue; }
  const filas = db.prepare('select local, visitante from partidos').all();
  const cuenta = new Map();
  for (const f of filas) {
    for (const lado of [f.local, f.visitante]) {
      const limpio = String(lado ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (['descansa', 'descans', 'descanso', 'atsedena'].includes(limpio)) {
        cuenta.set(limpio, (cuenta.get(limpio) ?? 0) + 1);
      }
    }
  }
  console.log(`${federacion}: ${[...cuenta.entries()].map(([k, n]) => `«${k}» ${n}`).join(' · ') || '(ninguno)'}`);
  db.close();
}
