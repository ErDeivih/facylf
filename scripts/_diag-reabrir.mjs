#!/usr/bin/env node
/** Reabre trabajos de un tipo para poder reintentarlos (sólo para pruebas). */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const tipo = process.argv[3];
const r = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0
  where tipo=? and estado<>'hecho'`).run(tipo);
console.log(`reabiertos ${r.changes} trabajos de tipo ${tipo}`);
db.close();
