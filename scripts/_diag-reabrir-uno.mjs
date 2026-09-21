#!/usr/bin/env node
/** Reabre un trabajo concreto (para probar una fase sin tocar el resto de la cola). */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const [tipo, temporada, competicion, grupo] = process.argv.slice(3);
const r = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0,
  actualizado_en=? where tipo=? and temporada=? and competicion=? and grupo=?`)
  .run(new Date().toISOString(), tipo, temporada, competicion, grupo);
console.log(`reabiertos ${r.changes} trabajos ${tipo} de t${temporada} c${competicion} g${grupo}`);
db.close();
