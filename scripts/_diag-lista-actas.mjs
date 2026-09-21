#!/usr/bin/env node
/** Lista las actas en un estado/incidencia dados, con su archivo, para poder inspeccionarlas. */
import { DatabaseSync } from 'node:sqlite';

const [fed, patron = '%acta_ilegible%', cuantas = '6'] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
for (const a of db.prepare(`select codigo, temporada, competicion, grupo, jornada, estado, archivo
  from actas where incidencias like ? limit ?`).all(patron, Number(cuantas))) {
  const nombre = db.prepare('select nombre from competiciones where codigo=? limit 1').get(a.competicion)?.nombre;
  console.log(`t${a.temporada} c${a.competicion} g${a.grupo} J${a.jornada} acta=${a.codigo} · ${a.estado} · ${nombre}`);
  console.log(`   ${a.archivo}`);
}
db.close();
