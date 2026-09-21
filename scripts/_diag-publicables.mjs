#!/usr/bin/env node
/**
 * Elige competiciones y grupos que la web considera publicables AHORA, para poder pedir sus páginas y
 * comprobar de verdad el efecto del cambio (y que el formato de slug es el correcto).
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const federacion = process.argv[2] ?? 'castilla-leon';
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.log(`sin cola: ${federacion}`); process.exit(0); }
const db = new DatabaseSync(ruta, { readOnly: true });

const grupoOk = (a) => `coalesce(${a}.jornadas,0)>0
  and (select count(*) from jornadas jp where jp.temporada=${a}.temporada and jp.competicion=${a}.competicion
    and jp.grupo=${a}.codigo and jp.archivo is not null)>=${a}.jornadas
  and exists(select 1 from trabajos tc where tc.temporada=${a}.temporada and tc.competicion=${a}.competicion
    and tc.grupo=${a}.codigo and tc.tipo='calendario' and tc.estado='hecho')
  and exists(select 1 from trabajos tcl where tcl.temporada=${a}.temporada and tcl.competicion=${a}.competicion
    and tcl.grupo=${a}.codigo and tcl.tipo='clasificacion' and tcl.estado='hecho')
  and not exists(select 1 from trabajos tp where tp.temporada=${a}.temporada and tp.competicion=${a}.competicion
    and tp.grupo=${a}.codigo and tp.tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
    and tp.estado not in ('hecho','cancelado'))
  and not exists(select 1 from actas ap where ap.temporada=${a}.temporada and ap.competicion=${a}.competicion
    and ap.grupo=${a}.codigo and ap.estado not in ('hecha','ausente_web','sin_datos'))`;

const filas = db.prepare(`select g.temporada, g.competicion, g.codigo, g.nombre, c.nombre competicionNombre
  from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
  where (${grupoOk('g')})
    and not exists(select 1 from grupos gx where gx.temporada=g.temporada and gx.competicion=g.competicion
      and gx.estado<>'ausente_web' and not (${grupoOk('gx')}))
  order by g.temporada desc limit 6`).all();
console.log(`${federacion}: competiciones publicables (con todos sus grupos listos): ${filas.length}`);
for (const f of filas) {
  console.log(`  t${f.temporada} c${f.competicion} g${f.codigo} · ${f.competicionNombre} · ${f.nombre}`);
  console.log(`     slug: ${federacion === 'castilla-leon' ? '' : `${federacion}--`}t${f.temporada}-c${f.competicion}-g${f.nombre}`);
}
db.close();
