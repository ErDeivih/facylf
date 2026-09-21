#!/usr/bin/env node
/** Índices de una cola y coste de la consulta que más usa la web para buscar. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const ruta = process.argv[2] ?? join(resolve(import.meta.dirname, '..'), 'descargas-federacion',
  'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true });
console.log('índices:');
for (const i of db.prepare("select name, tbl_name from sqlite_master where type='index' order by tbl_name").all()) {
  console.log(`  ${i.tbl_name}.${i.name}`);
}
const consulta = `with resumen as (
    select temporada,competicion,grupo,count(*) partidos,
      sum(case when goles_local is not null then 1 else 0 end) resultados
    from partidos group by temporada,competicion,grupo)
  select g.temporada, g.competicion, g.codigo, g.nombre, resumen.partidos
  from grupos g left join resumen on resumen.temporada=g.temporada
    and resumen.competicion=g.competicion and resumen.grupo=g.codigo
  where g.nombre like '%girona%' limit 6`;
const inicio = Date.now();
const filas = db.prepare(consulta).all();
console.log(`\nconsulta tipo búsqueda: ${filas.length} filas en ${Date.now() - inicio} ms`);
const plan = db.prepare(`explain query plan ${consulta}`).all();
for (const p of plan) console.log('  plan:', p.detail);
db.close();
