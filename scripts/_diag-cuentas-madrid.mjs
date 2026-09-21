#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const u = (s) => db.prepare(s).get();
console.log('partidos:', u('select count(*) n from partidos').n);
console.log('jornadas con archivo:', u("select count(*) n from jornadas where archivo is not null and archivo <> ''").n);
console.log('actas:', u('select count(*) n from actas').n);
console.log('actas distintas (codigo):', u('select count(distinct codigo) n from actas').n);
console.log('actas distintas (clave compuesta):', u('select count(*) n from (select distinct temporada,competicion,grupo,jornada,codigo from actas)').n);
for (const f of db.prepare("select tipo, estado, count(*) n from trabajos group by tipo, estado order by n desc limit 14").all()) {
  console.log(`  ${f.tipo} ${f.estado}: ${f.n}`);
}
db.close();
