#!/usr/bin/env node
/** Jornadas con fecha imposible en una cola: qué dicen exactamente y de dónde salen. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const limite = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
const filas = db.prepare(`select temporada, competicion, grupo, numero, fecha, archivo from jornadas
  where fecha is not null and fecha > ? order by fecha desc limit 8`).all(limite);
console.log(`${filas.length} jornadas con fecha posterior a ${limite}:`);
for (const f of filas) {
  console.log(`  t${f.temporada} c${f.competicion} g${f.grupo} J${f.numero} → ${f.fecha}`);
  console.log(`     ${f.archivo}`);
}
db.close();
