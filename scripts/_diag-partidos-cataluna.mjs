#!/usr/bin/env node
/** ¿Se han completado fecha, hora y campo de los partidos a partir de las actas? */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const r = db.prepare(`select count(*) n,
  sum(hora is not null) conHora, sum(campo is not null) conCampo, sum(arbitro is not null) conArbitro,
  sum(goles_local is not null) conMarcador from partidos`).get();
console.log('partidos:', JSON.stringify(r));
console.log('\núltimos partidos con datos de acta:');
for (const p of db.prepare(`select jornada, local, visitante, goles_local, goles_visitante, fecha, hora, campo, arbitro
  from partidos where hora is not null or campo is not null order by jornada desc limit 5`).all()) {
  console.log(`  J${p.jornada} ${p.local} ${p.goles_local}-${p.goles_visitante} ${p.visitante}`);
  console.log(`      ${p.fecha} ${p.hora} · ${p.campo} · ${String(p.arbitro ?? '').slice(0, 40)}`);
}
db.close();
