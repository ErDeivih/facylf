#!/usr/bin/env node
/** Resumen del estado de los trabajos que se adelantaron para el arreglo de jornadas sin partidos. */
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('descargas-valencia/recolector-local/cola-v2.sqlite', { readOnly: true });
console.log('trabajos de jornada con prioridad 0 (los adelantados):');
for (const f of db.prepare(`select estado, count(*) n from trabajos where tipo='jornada' and prioridad=0
  group by estado order by n desc`).all()) {
  console.log(`   ${f.estado}: ${f.n}`);
}
console.log('\ncómo acabaron los que estaban aplazados por «no publica partidos» y ya se han resuelto:');
for (const f of db.prepare(`select estado, count(*) n from trabajos where tipo='jornada'
  and (ultimo_error is null or ultimo_error not like '%no publica%')
  and clave in (select clave from trabajos where tipo='jornada' and prioridad=0)
  group by estado order by n desc`).all()) {
  console.log(`   ${f.estado}: ${f.n}`);
}
console.log('\njornadas guardadas sin partidos (con nota):');
const conNota = db.prepare(`select count(*) n from archivos where tipo='jornada' and ruta like '%jornadas%'`).get().n;
console.log(`   ficheros de jornada archivados en total: ${conNota}`);
db.close();
