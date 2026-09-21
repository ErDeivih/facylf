#!/usr/bin/env node
/**
 * Reabre los trabajos `calendario` de grupos cuyos partidos se guardaron antes de que se capturaran
 * los códigos de equipo. Se vuelven a leer una vez (una petición por grupo) para completarlos.
 */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
const grupos = db.prepare(`select distinct temporada, competicion, grupo from partidos
  where equipo_local_codigo is null and equipo_visitante_codigo is null`).all();
let reabiertos = 0;
for (const g of grupos) {
  const r = db.prepare(`update trabajos set estado='pendiente', siguiente_intento=null, intentos=0,
    actualizado_en=? where tipo='calendario' and temporada=? and competicion=? and grupo=?`)
    .run(new Date().toISOString(), g.temporada, g.competicion, g.grupo);
  reabiertos += Number(r.changes ?? 0);
  console.log(`  reabierto calendario de t${g.temporada} c${g.competicion} g${g.grupo}`);
}
console.log(`total reabiertos: ${reabiertos}`);
db.close();
