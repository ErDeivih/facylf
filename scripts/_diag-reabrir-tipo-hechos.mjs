#!/usr/bin/env node
/** Reabre los trabajos YA HECHOS de un tipo (para regenerar ficheros con un formato nuevo). */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const tipo = process.argv[3];
const r = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0,
  actualizado_en=? where tipo=? and estado='hecho'`).run(new Date().toISOString(), tipo);
console.log(`reabiertos ${r.changes} trabajos ${tipo} que estaban hechos`);
db.close();
