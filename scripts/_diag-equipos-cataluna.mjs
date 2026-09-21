#!/usr/bin/env node
/** Comprueba que los calendarios capturados traen equipos con código y cuántos partidos lo tienen. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const u = (s) => db.prepare(s).get();
console.log('partidos:', u('select count(*) n from partidos').n);
console.log('  con código de local:', u('select count(*) n from partidos where equipo_local_codigo is not null').n);
console.log('  con código de visitante:', u('select count(*) n from partidos where equipo_visitante_codigo is not null').n);
console.log('equipos:', u('select count(*) n from equipos').n);
console.log('jornadas con fichero:', u("select count(*) n from jornadas where archivo is not null").n);
console.log('grupos con partidos:', u('select count(distinct grupo) n from partidos').n);
for (const g of db.prepare(`select grupo, count(*) n, sum(equipo_local_codigo is not null) con from partidos
  group by grupo order by grupo`).all()) {
  console.log(`  grupo ${g.grupo}: ${g.n} partidos, ${g.con} con código`);
}
for (const e of db.prepare('select codigo, nombre from equipos limit 4').all()) {
  console.log(`  equipo ${e.codigo} · ${e.nombre}`);
}
db.close();
