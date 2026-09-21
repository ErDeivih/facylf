#!/usr/bin/env node
/** Foto rápida de una cola: trabajos por tipo/estado, actas, jornadas y partidos. */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
const db = new DatabaseSync(ruta, { readOnly: true });
const uno = (sql) => db.prepare(sql).get();
const varios = (sql) => db.prepare(sql).all();

console.log(`== ${ruta}`);
for (const t of varios(`select name from sqlite_master where type='table' order by name`)) {
  const n = db.prepare(`select count(*) as n from "${t.name}"`).get().n;
  console.log(`  tabla ${t.name}: ${n}`);
}
console.log('-- trabajos por tipo/estado --');
for (const f of varios(`select tipo, estado, count(*) as n from trabajos group by tipo, estado order by tipo, n desc`)) {
  console.log(`  ${String(f.tipo).padEnd(16)} ${String(f.estado).padEnd(14)} ${f.n}`);
}
console.log('-- actas por estado --');
for (const f of varios(`select estado, count(*) as n from actas group by estado order by n desc`)) console.log(`  ${f.estado}: ${f.n}`);
console.log('-- jornadas --');
for (const f of varios(`select count(*) as n, sum(case when archivo is not null then 1 else 0 end) as con_archivo from jornadas`)) {
  console.log(`  total ${f.n} · con archivo ${f.con_archivo}`);
}
console.log('-- partidos --');
for (const f of varios(`select count(*) as n, sum(case when codigo_acta is not null then 1 else 0 end) as con_acta from partidos`)) {
  console.log(`  total ${f.n} · con codacta ${f.con_acta}`);
}
console.log('-- peticiones recientes --');
console.log(JSON.stringify(varios(`select * from peticiones order by id desc limit 3`), null, 1).slice(0, 800));
db.close();
