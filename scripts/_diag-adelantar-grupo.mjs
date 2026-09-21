#!/usr/bin/env node
/** Adelanta un grupo concreto al frente de la cola (para verificar un arreglo en vivo). */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, temporada, competicion, grupo, prioridad = '-1'] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb);
db.exec('pragma busy_timeout=10000');
const r = db.prepare(`update trabajos set prioridad=?, siguiente_intento=null, actualizado_en=?
  where temporada=? and competicion=? and grupo=? and tipo='jornada' and estado='pendiente'`)
  .run(Number(prioridad), new Date().toISOString(), temporada, competicion, grupo);
console.log(`adelantados ${r.changes} trabajos de jornada de t${temporada} c${competicion} g${grupo} a prioridad ${prioridad}`);
db.close();
