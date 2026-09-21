#!/usr/bin/env node
/** Estado de los trabajos de un grupo concreto. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const [temporada, competicion, grupo] = process.argv.slice(2);
for (const t of db.prepare(`select tipo, estado, intentos, ultimo_error, siguiente_intento from trabajos
  where temporada=? and competicion=? and grupo=? and tipo<>'acta'`).all(temporada, competicion, grupo)) {
  console.log(JSON.stringify(t));
}
console.log('actas:', JSON.stringify(db.prepare(`select estado, count(*) n from actas
  where temporada=? and competicion=? and grupo=? group by estado`).all(temporada, competicion, grupo)));
console.log('grupo:', JSON.stringify(db.prepare(`select estado, jornadas, jornadas_comprobadas_en
  from grupos where temporada=? and competicion=? and codigo=?`).get(temporada, competicion, grupo)));
db.close();
