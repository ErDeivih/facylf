#!/usr/bin/env node
/** Cruce entre la fila de `actas` y el estado de su trabajo, para una competición. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const temporada = process.argv[2]; const competicion = process.argv[3];
const filas = db.prepare(`select a.estado acta, t.estado trabajo, count(*) n
  from actas a left join trabajos t on t.tipo='acta' and t.temporada=a.temporada
    and t.competicion=a.competicion and t.grupo=a.grupo and t.jornada=a.jornada and t.acta=a.codigo
  where a.temporada=? and a.competicion=? group by a.estado, t.estado`).all(temporada, competicion);
console.log('actas × trabajos:');
for (const f of filas) console.log(`  acta=${f.acta} · trabajo=${f.trabajo ?? '(sin trabajo)'} → ${f.n}`);
const conHora = db.prepare(`select count(*) n from partidos where competicion=? and hora is not null`).get(competicion).n;
console.log(`partidos de la competición con hora: ${conHora}`);
db.close();
