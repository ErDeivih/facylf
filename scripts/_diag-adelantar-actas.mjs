#!/usr/bin/env node
/**
 * Adelanta las actas de una competición concreta para poder verificar el último eslabón (que sus
 * datos lleguen a la web). No inventa trabajo: son fichas que había que bajar igualmente, sólo se
 * cambia el orden. Las prioridades se recalculan solas en el siguiente `preparar` del supervisor.
 */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'recolector-local', 'cola-v2.sqlite'));
const [temporada, competicion] = process.argv.slice(2);
const r = db.prepare(`update trabajos set prioridad=1, siguiente_intento=null where tipo='acta'
  and temporada=? and competicion=? and estado in ('pendiente','bloqueado')`).run(temporada, competicion);
console.log(`adelantadas ${r.changes} actas de t${temporada} c${competicion}`);
console.log('pendientes de otros tipos en esa competición:',
  JSON.stringify(db.prepare(`select tipo, estado, count(*) n from trabajos where temporada=? and competicion=?
    and tipo<>'acta' and estado not in ('hecho','cancelado') group by tipo, estado`).all(temporada, competicion)));
db.close();
