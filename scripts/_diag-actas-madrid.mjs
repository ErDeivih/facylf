#!/usr/bin/env node
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
for (const p of db.prepare('select id, trabajo, url, iniciada_en, duracion_ms, resultado, detalle from peticiones order by id desc limit 6').all()) {
  console.log(`${p.id} ${p.iniciada_en} +${p.duracion_ms}ms ${p.resultado} ${p.detalle}  ${p.url}`);
}
const actas = db.prepare("select codigo, estado, calidad, incidencias, version_parser, archivo from actas where estado='hecha' order by comprobada_en desc limit 3").all();
console.log('\nactas hechas recientes:');
for (const a of actas) console.log(` ${a.codigo} · ${a.estado} · ${a.calidad} · v${a.version_parser} · ${a.incidencias}\n   ${a.archivo}`);
console.log('\nresumen:', JSON.stringify(db.prepare(`select
  (select count(*) from actas where estado='hecha') hechas,
  (select count(*) from participaciones) participaciones,
  (select count(*) from eventos_acta) eventos,
  (select count(*) from tecnicos_acta) tecnicos,
  (select count(*) from personas) personas`).get()));
db.close();
