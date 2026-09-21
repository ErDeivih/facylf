#!/usr/bin/env node
/**
 * Vuelca el esquema de una cola SQLite legible (para el importador). Sólo lectura.
 * Uso: node scripts/_diag-esquema-origen.mjs [ruta-cola]
 */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2] ?? 'descargas-canarias/recolector-local/cola-v2.sqlite';
const db = new DatabaseSync(ruta, { readOnly: true });
console.log(`== ${ruta}`);
for (const t of db.prepare(`select name, sql from sqlite_master where type='table' and name not like 'sqlite_%' order by name`).all()) {
  console.log(`\n== ${t.name}`);
  console.log(String(t.sql).replace(/\s+/g, ' '));
  const filas = db.prepare(`select count(*) n from "${t.name}"`).get().n;
  console.log(`   filas: ${filas}`);
}
console.log('\n== índices');
for (const i of db.prepare(`select name, tbl_name, sql from sqlite_master where type='index' order by tbl_name, name`).all()) {
  console.log(`   ${i.tbl_name} · ${i.name}: ${String(i.sql ?? '').replace(/\s+/g, ' ')}`);
}
db.close();
