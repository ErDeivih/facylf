/*
 * ¿Sigue en pie la recuperación de Valencia, o el recolector ha reescrito esas jornadas?
 *
 * El recolector, al re-comprobar una jornada, BORRA sus filas y las vuelve a escribir desde la fuente. Como
 * la fuente nunca publicó los 28 partidos recuperados (su hueco lo ocupa «Descansa»), una re-comprobación
 * posterior los borraría. Esto lo mide: cuántas de esas jornadas se han vuelto a comprobar después del lote.
 *
 * Sólo lee. Uso: node scripts/_diag-recuperacion-valencia.mjs [desdeISO]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const desde = process.argv[2] ?? '2026-09-17T11:56:00.000Z';
const db = new DatabaseSync(join(raiz, 'descargas-valencia', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const VOCABULARIO = ['descansa', 'descans', 'descanso'];
const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const filas = db.prepare('select local, visitante from partidos').all();
const descanso = filas.filter((f) => VOCABULARIO.includes(norm(f.local)) || VOCABULARIO.includes(norm(f.visitante))).length;
console.log(`filas con lado de descanso en toda la cola: ${descanso} (686 antes del lote, 658 después)`);

const recomprobadas = db.prepare(`select count(*) n from jornadas
  where competicion='29509571' and grupo='904325856' and comprobada_en > ?`).get(desde).n;
const reescritas = db.prepare(`select count(*) n from partidos
  where competicion='29509571' and grupo='904325856' and actualizado_en > ?`).get(desde).n;
console.log(`jornadas del grupo 904325856 re-comprobadas después del lote: ${recomprobadas}`);
console.log(`filas del grupo reescritas después del lote: ${reescritas}`);

const canales = db.prepare(`select count(*) n from partidos
  where competicion='29509571' and grupo='904325856' and local like 'Canals Promeses%'`).get().n;
console.log(`filas donde Canals Promeses C.F. 'A' juega de local: ${canales} (28 recuperadas esperadas)`);
db.close();
