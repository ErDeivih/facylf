#!/usr/bin/env node
/**
 * Muestra un par de filas reales de cada tabla relevante de una cola, para escribir el mapeo con los
 * ojos puestos en los datos (no en la documentación). Sólo lectura.
 *
 * Uso: node scripts/_diag-muestra-origen.mjs [federacion]
 */
import { DatabaseSync } from 'node:sqlite';

const fed = process.argv[2] ?? 'canarias';
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const muestra = (sql, n = 3) => {
  try { return db.prepare(sql).all().slice(0, n); } catch (e) { return [`ERROR: ${e.message}`]; }
};
console.log(`== ${fed}`);
for (const [tabla, sql] of [
  ['temporadas', 'select * from temporadas order by codigo'],
  ['competiciones', 'select * from competiciones limit 3'],
  ['grupos', 'select * from grupos limit 3'],
  ['jornadas', 'select * from jornadas limit 3'],
  ['equipos', 'select * from equipos limit 4'],
  ['partidos', 'select * from partidos where goles_local is null limit 2'],
  ['partidos con resultado', 'select * from partidos where goles_local is not null limit 2'],
  ['actas', 'select codigo,temporada,competicion,grupo,jornada,menores,estado,calidad,incidencias,version_parser,substr(datos,1,120) datos from actas limit 3'],
  ['participaciones', 'select * from participaciones limit 3'],
  ['participaciones: condiciones', "select condicion, count(*) n, sum(jugador_codigo is null) sin_codigo from participaciones group by condicion"],
  ['eventos_acta', 'select * from eventos_acta limit 4'],
  ['eventos_acta: tipos', 'select tipo, subtipo, sujeto_tipo, lado_beneficiado, count(*) n from eventos_acta group by tipo, subtipo, sujeto_tipo, lado_beneficiado order by n desc limit 15'],
  ['tecnicos_acta', 'select * from tecnicos_acta limit 4'],
  ['tecnicos_acta: roles', 'select rol, count(*) n from tecnicos_acta group by rol order by n desc limit 20'],
  ['personas', 'select * from personas limit 3'],
]) {
  console.log(`\n== ${tabla}`);
  for (const f of muestra(sql)) console.log('  ', JSON.stringify(f));
}
db.close();
