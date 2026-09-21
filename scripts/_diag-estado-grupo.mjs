#!/usr/bin/env node
/**
 * Estado de un grupo en una cola: jornadas del índice, jornadas con archivo, partidos, obras vivas
 * y qué jornadas de las aplazadas tienen el motivo «la fuente no publica».
 *
 * Uso: node scripts/_diag-estado-grupo.mjs <federacion> <temporada> <competicion> <grupo>
 */
import { DatabaseSync } from 'node:sqlite';

const [fed, temporada, competicion, grupo] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const g = db.prepare(`select nombre, estado, jornadas, comprobado_en from grupos
  where temporada=? and competicion=? and codigo=?`).get(temporada, competicion, grupo);
console.log('grupo:', g ?? 'no existe');
console.log('jornadas del índice:', db.prepare(`select count(*) n, sum(case when archivo is not null then 1 else 0 end) conArchivo
  from jornadas where temporada=? and competicion=? and grupo=?`).get(temporada, competicion, grupo));
console.log('partidos:', db.prepare(`select count(*) n, sum(case when goles_local is not null then 1 else 0 end) conResultado
  from partidos where temporada=? and competicion=? and grupo=?`).get(temporada, competicion, grupo));
console.log('actas:', db.prepare(`select estado, count(*) n from actas where temporada=? and competicion=? and grupo=?
  group by estado`).all(temporada, competicion, grupo));
console.log('trabajos:', db.prepare(`select tipo, estado, count(*) n from trabajos where temporada=? and competicion=?
  and grupo=? group by tipo, estado order by tipo`).all(temporada, competicion, grupo));
console.log('trabajos aplazados:');
for (const t of db.prepare(`select tipo, jornada, intentos, siguiente_intento, ultimo_error from trabajos
  where temporada=? and competicion=? and grupo=? and ultimo_error is not null order by jornada limit 12`)
  .all(temporada, competicion, grupo)) {
  console.log(`   ${t.tipo} J${t.jornada} intentos=${t.intentos} sig=${t.siguiente_intento} · ${String(t.ultimo_error).slice(0, 70)}`);
}
db.close();
