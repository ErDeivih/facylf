#!/usr/bin/env node
/**
 * ¿Qué grupos cambian de publicable con el cambio de la web?
 *
 *  Se evalúa la condición REAL de `grupoProcesado` (copiada literalmente de
 *  `apps/web/src/lib/repositorio-local.ts`) con la cláusula de actas antigua (`estado<>'hecha'`) y con
 *  la nueva (`estado not in ('hecha','ausente_web')`), para ver qué grupos pasan a poder publicarse.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const federacion = process.argv[2] ?? 'extremadura';
const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.log(`no hay cola de ${federacion}`); process.exit(0); }

const db = new DatabaseSync(ruta, { readOnly: true });
const comun = (g) => `coalesce(g.jornadas,0)>0
  and (select count(*) from jornadas jp where jp.temporada=g.temporada and jp.competicion=g.competicion
    and jp.grupo=g.codigo and jp.archivo is not null)>=g.jornadas
  and exists(select 1 from trabajos tc where tc.temporada=g.temporada and tc.competicion=g.competicion
    and tc.grupo=g.codigo and tc.tipo='calendario' and tc.estado='hecho')
  and exists(select 1 from trabajos tcl where tcl.temporada=g.temporada and tcl.competicion=g.competicion
    and tcl.grupo=g.codigo and tcl.tipo='clasificacion' and tcl.estado='hecho')
  and not exists(select 1 from trabajos tp where tp.temporada=g.temporada and tp.competicion=g.competicion
    and tp.grupo=g.codigo and tp.tipo in ('indice_jornadas','calendario','clasificacion','jornada','acta')
    and tp.estado not in ('hecho','cancelado'))`;

const vieja = `${comun('g')} and not exists(select 1 from actas ap where ap.temporada=g.temporada
  and ap.competicion=g.competicion and ap.grupo=g.codigo and ap.estado<>'hecha')`;
const nueva = `${comun('g')} and not exists(select 1 from actas ap where ap.temporada=g.temporada
  and ap.competicion=g.competicion and ap.grupo=g.codigo and ap.estado not in ('hecha','ausente_web'))`;

const cuenta = (sql) => db.prepare(`select count(*) n from grupos g where ${sql}`).get().n;
console.log(`${federacion}: grupos publicables`);
console.log(`  con la cláusula antigua (acta ausente bloquea): ${cuenta(vieja)}`);
console.log(`  con la nueva (acta ausente no bloquea):        ${cuenta(nueva)}`);

const ausentes = db.prepare(`select estado, count(*) n from actas group by estado order by n desc`).all();
console.log('  actas por estado:', JSON.stringify(ausentes));
for (const g of db.prepare(`select g.temporada, g.competicion, g.nombre from grupos g
  where (${nueva}) and not (${vieja}) limit 8`).all()) {
  console.log(`  desbloqueado: t${g.temporada} c${g.competicion} · ${g.nombre}`);
}
db.close();
