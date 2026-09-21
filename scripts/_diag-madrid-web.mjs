#!/usr/bin/env node
/** Un grupo de Madrid que la web ya publica, para comprobar su cobertura (¿cuenta las actas?). */
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const db = new DatabaseSync(join(RAIZ, 'descargas-madrid', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const grupoOk = (a) => `coalesce(${a}.jornadas,0)>0
  and (select count(*) from jornadas jp where jp.temporada=${a}.temporada and jp.competicion=${a}.competicion
    and jp.grupo=${a}.codigo and jp.archivo is not null)>=${a}.jornadas
  and exists(select 1 from trabajos tc where tc.temporada=${a}.temporada and tc.competicion=${a}.competicion
    and tc.grupo=${a}.codigo and tc.tipo='calendario' and tc.estado='hecho')
  and exists(select 1 from trabajos tcl where tcl.temporada=${a}.temporada and tcl.competicion=${a}.competicion
    and tcl.grupo=${a}.codigo and tcl.tipo='clasificacion' and tcl.estado='hecho')
  and not exists(select 1 from trabajos tp where tp.temporada=${a}.temporada and tp.competicion=${a}.competicion
    and tp.grupo=${a}.codigo and tp.tipo in ('indice_jornadas','calendario','clasificacion','jornada')
    and tp.estado not in ('hecho','cancelado'))`;

const filas = db.prepare(`select g.temporada, g.competicion, g.codigo, c.nombre competicionNombre, g.nombre grupo
  from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
  where c.grupos_comprobados_en is not null and (${grupoOk('g')})
    and not exists(select 1 from grupos gx where gx.temporada=g.temporada and gx.competicion=g.competicion
      and gx.estado<>'ausente_web' and not (${grupoOk('gx')}))
  order by g.temporada desc limit 5`).all();
console.log(`grupos de Madrid publicables: ${filas.length}`);
for (const f of filas) {
  const actas = db.prepare(`select estado, count(*) n from actas where temporada=? and competicion=? and grupo=? group by estado`).all(f.temporada, f.competicion, f.codigo);
  console.log(`  ${f.competicionNombre} · ${f.grupo} → slug madrid--t${f.temporada}-c${f.competicion}-g${f.codigo}`);
  console.log(`     actas del grupo: ${JSON.stringify(actas)}`);
}
db.close();
