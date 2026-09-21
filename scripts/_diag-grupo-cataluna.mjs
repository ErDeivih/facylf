#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const comp = process.argv[3];
for (const t of db.prepare('select tipo,estado,intentos,ultimo_error,siguiente_intento from trabajos where competicion=?').all(comp)) {
  console.log(JSON.stringify(t));
}
console.log('jornadas:', JSON.stringify(db.prepare('select count(*) n, sum(archivo is not null) con from jornadas').get()));
console.log('partidos:', JSON.stringify(db.prepare('select count(*) n, sum(codigo_acta is not null) conacta, sum(goles_local is not null) conmarcador from partidos').get()));
console.log('actas:', JSON.stringify(db.prepare('select estado, count(*) n from actas group by estado').all()));
for (const p of db.prepare('select url, resultado, detalle, iniciada_en from peticiones order by id desc limit 5').all()) {
  console.log(`  ${p.iniciada_en} ${p.resultado} ${p.detalle} ${p.url}`);
}
db.close();
