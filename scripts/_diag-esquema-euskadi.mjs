#!/usr/bin/env node
/** SÓLO LECTURA: esquema y recuentos de la cola de Euskadi. Uso: node scripts/_diag-esquema-euskadi.mjs */
import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const ruta = join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true });
console.log('== tablas ==');
const tablas = db.prepare("select name from sqlite_master where type = 'table' order by name").all().map((t) => t.name);
console.log(tablas.join(', '));
for (const t of ['partidos', 'jornadas', 'actas', 'equipos', 'trabajos', 'clasificaciones', 'competiciones', 'temporadas', 'archivos']) {
  if (!tablas.includes(t)) { console.log(`-- ${t}: NO EXISTE`); continue; }
  const n = db.prepare(`select count(*) n from ${t}`).get().n;
  const cols = Object.keys(db.prepare(`select * from ${t} limit 1`).get() ?? {});
  console.log(`-- ${t} (${n} filas)\n   ${cols.join(', ')}`);
}
console.log('== códigos de equipo en partidos de Euskadi ==');
const r = db.prepare(`select
    count(*) total,
    sum(case when equipo_local_codigo is null and equipo_visitante_codigo is null then 1 else 0 end) sin_ninguno,
    sum(case when equipo_local_codigo is not null or equipo_visitante_codigo is not null then 1 else 0 end) con_alguno
  from partidos`).get();
console.log(r);
db.close();
