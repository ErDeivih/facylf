#!/usr/bin/env node
/** Vuelca el esquema de las tablas principales de una cola. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const t of ['temporadas', 'competiciones', 'grupos', 'jornadas', 'partidos', 'actas', 'trabajos']) {
  const r = db.prepare('select sql from sqlite_master where type=? and name=?').get('table', t);
  console.log(`\n### ${t}\n${(r?.sql ?? '(no existe)').replace(/\s+/g, ' ')}`);
}
db.close();
