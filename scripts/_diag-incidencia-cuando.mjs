#!/usr/bin/env node
/** Cruza las incidencias de calidad con la versión de parser y la fecha de captura. */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
const patron = process.argv[3]; // p.ej. '%sin_alineaciones%'
if (!ruta || !patron) throw new Error('Uso: node scripts/_diag-incidencia-cuando.mjs <cola-v2.sqlite> "<patron like>"');
const db = new DatabaseSync(ruta, { readOnly: true });

console.log(`== ${ruta} · incidencias ${patron}`);
const porParser = db
  .prepare(
    `select version_parser v, count(*) n, min(comprobada_en) desde, max(comprobada_en) hasta
       from actas where estado='hecha' and incidencias like ? group by v order by n desc`,
  )
  .all(patron);
console.log('-- por versión de parser --');
for (const f of porParser) console.log(`  v${f.v ?? '-'}: ${f.n}  (${f.desde} → ${f.hasta})`);

const porTemporada = db
  .prepare(
    `select temporada t, count(*) n from actas where estado='hecha' and incidencias like ?
      group by t order by t desc limit 12`,
  )
  .all(patron);
console.log('-- por temporada --');
for (const f of porTemporada) console.log(`  ${f.t}: ${f.n}`);

const porCompeticion = db
  .prepare(
    `select competicion c, grupo g, count(*) n from actas where estado='hecha' and incidencias like ?
      group by c, g order by n desc limit 10`,
  )
  .all(patron);
console.log('-- competiciones/grupos con más casos --');
for (const f of porCompeticion) console.log(`  c${f.c} g${f.g}: ${f.n}`);

const muestra = db
  .prepare(`select codigo, archivo, incidencias from actas where estado='hecha' and incidencias like ? order by random() limit 5`)
  .all(patron);
console.log('-- muestra aleatoria --');
for (const f of muestra) console.log(`  ${f.codigo}  ${f.archivo}\n     ${f.incidencias}`);
db.close();
