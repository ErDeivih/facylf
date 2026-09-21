#!/usr/bin/env node
/** ¿Se publica ya la competición que estaba atrapada por actas inexistentes? */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const [federacion, temporada, competicion] = [process.argv[2], process.argv[3], process.argv[4]];
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const grupoOk = (a, actaClausula) => `coalesce(${a}.jornadas,0)>0
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
    and ap.grupo=${a}.codigo and ${actaClausula})`;

const nueva = "ap.estado not in ('hecha','ausente_web')";
const vieja = "ap.estado<>'hecha'";

console.log(`competición t${temporada} c${competicion} de ${federacion}`);
for (const g of db.prepare(`select codigo, nombre, jornadas, estado from grupos where temporada=? and competicion=?`).all(temporada, competicion)) {
  const okNueva = Boolean(db.prepare(`select 1 from grupos g where g.temporada=? and g.competicion=? and g.codigo=? and (${grupoOk('g', nueva)})`).get(temporada, competicion, g.codigo));
  const okVieja = Boolean(db.prepare(`select 1 from grupos g where g.temporada=? and g.competicion=? and g.codigo=? and (${grupoOk('g', vieja)})`).get(temporada, competicion, g.codigo));
  const actas = db.prepare(`select estado, count(*) n from actas where temporada=? and competicion=? and grupo=? group by estado`).all(temporada, competicion, g.codigo);
  console.log(`  ${String(g.codigo).padEnd(10)} ${String(g.nombre).slice(0, 26).padEnd(28)} jornadas=${g.jornadas ?? '-'} · listo ahora=${okNueva ? 'SÍ' : 'no'} · con la cláusula antigua=${okVieja ? 'SÍ' : 'no'}`);
  console.log(`      actas: ${JSON.stringify(actas)}`);
}
db.close();
