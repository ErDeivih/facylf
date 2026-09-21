#!/usr/bin/env node
/**
 * Reproduce la consulta EXACTA con la que la web decide qué competiciones publica, contra la base de
 * datos real, y dice si la competición atrapada entra o no (y por qué no, si no entra).
 */
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const [federacion, temporada, competicion] = process.argv.slice(2);
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const condicionGrupo = (actaClausula) => `coalesce(gx.jornadas,0)>0
  and (select count(*) from jornadas jp where jp.temporada=gx.temporada and jp.competicion=gx.competicion
    and jp.grupo=gx.codigo and jp.archivo is not null)>=gx.jornadas
  and exists(select 1 from trabajos tc where tc.temporada=gx.temporada and tc.competicion=gx.competicion
    and tc.grupo=gx.codigo and tc.tipo='calendario' and tc.estado='hecho')
  and exists(select 1 from trabajos tcl where tcl.temporada=gx.temporada and tcl.competicion=gx.competicion
    and tcl.grupo=gx.codigo and tcl.tipo='clasificacion' and tcl.estado='hecho')
  and not exists(select 1 from trabajos tp where tp.temporada=gx.temporada and tp.competicion=gx.competicion
    and tp.grupo=gx.codigo and tp.tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
    and tp.estado not in ('hecho','cancelado'))
  and not exists(select 1 from actas ap where ap.temporada=gx.temporada and ap.competicion=gx.competicion
    and ap.grupo=gx.codigo and ${actaClausula})`;

const consulta = (actaClausula) => `select c.temporada, c.codigo from competiciones c
  where c.grupos_comprobados_en is not null
    and exists(select 1 from grupos g0 where g0.temporada=c.temporada and g0.competicion=c.codigo
      and g0.estado<>'ausente_web')
    and not exists(select 1 from grupos gx where gx.temporada=c.temporada and gx.competicion=c.codigo
      and gx.estado<>'ausente_web' and not (${condicionGrupo(actaClausula)}))`;

for (const [etiqueta, clausula] of [['actual (hecha, ausente_web y sin_datos no bloquean)', "ap.estado not in ('hecha','ausente_web','sin_datos')"],
  ['antigua (sólo hecha)', "ap.estado<>'hecha'"]]) {
  const entra = Boolean(db.prepare(`${consulta(clausula)} and c.temporada=? and c.codigo=?`).get(temporada, competicion));
  const total = db.prepare(`select count(*) n from (${consulta(clausula)})`).get().n;
  console.log(`con la cláusula ${etiqueta}: ${entra ? 'SÍ entra' : 'NO entra'} · total publicables en ${federacion}: ${total}`);
}

// Si no entra con la nueva, se dice exactamente qué grupo la bloquea y por qué.
console.log('\nqué bloquea a cada grupo:');
for (const g of db.prepare(`select codigo, nombre, jornadas, estado from grupos where temporada=? and competicion=?`).all(temporada, competicion)) {
  const razones = [];
  if (!(g.jornadas > 0)) razones.push('sin jornadas');
  const conArchivo = db.prepare(`select count(*) n from jornadas where temporada=? and competicion=? and grupo=? and archivo is not null`).get(temporada, competicion, g.codigo).n;
  if (conArchivo < g.jornadas) razones.push(`jornadas con archivo ${conArchivo}/${g.jornadas}`);
  for (const tipo of ['calendario', 'clasificacion']) {
    const hecho = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=? and grupo=? and tipo=? and estado='hecho'`).get(temporada, competicion, g.codigo, tipo).n;
    if (!hecho) razones.push(`sin ${tipo} hecho`);
  }
  const pendientes = db.prepare(`select tipo, estado, count(*) n from trabajos where temporada=? and competicion=? and grupo=?
    and tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta') and estado not in ('hecho','cancelado')
    group by tipo, estado`).all(temporada, competicion, g.codigo);
  if (pendientes.length) razones.push(`trabajos vivos: ${JSON.stringify(pendientes)}`);
  const actas = db.prepare(`select estado, count(*) n from actas where temporada=? and competicion=? and grupo=? and estado not in ('hecha','ausente_web','sin_datos') group by estado`).all(temporada, competicion, g.codigo);
  if (actas.length) razones.push(`actas sin resolver: ${JSON.stringify(actas)}`);
  console.log(`  ${g.nombre}: ${razones.length ? razones.join(' · ') : 'correcto'}`);
}
db.close();
