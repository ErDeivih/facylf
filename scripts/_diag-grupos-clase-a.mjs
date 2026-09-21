#!/usr/bin/env node
/**
 * SÓLO LECTURA: los grupos concretos de los 174 casos, y si su clasificación archivada sirve de catálogo.
 *
 * Para cada grupo afectado se mide: partidos, cuántos sin código, equipos distintos, si hay
 * `clasificacion.html` archivada, cuántos enlaces `codequipo=` trae y cuántos de los equipos del
 * calendario quedarían con código gracias a ella. Sin esto no se sabe si el problema es de datos o de
 * que esos grupos simplemente no tienen la relación código→nombre publicada.
 *
 * Uso: npx tsx scripts/_diag-grupos-clase-a.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};
const dirDe = (temporada, competicion, grupo) => {
  for (const t of readdirSync(base)) {
    if (!t.startsWith(`t${temporada}-`)) continue;
    const p = join(base, t, `comp-${competicion}`, `grupo-${grupo}`);
    if (existsSync(p)) return p;
  }
  return null;
};

/* Los grupos de los 174 casos: los que tienen partidos con acta analizada y ningún código. */
const afectados = db.prepare(`select a.temporada, a.competicion, a.grupo, count(*) casos
  from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
    and p.grupo=a.grupo and p.codigo_acta=a.codigo
 where a.datos is not null and p.equipo_local_codigo is null
 group by 1,2,3 order by 4 desc`).all();

console.log(`grupos con actas analizadas y partidos sin código: ${afectados.length}\n`);
console.log('temporada competición  grupo        con acta  partidos  equipos  clasificación  codequipo  cubren');
let conClasif = 0, sinClasif = 0, conEnlaces = 0;
const detalle = [];
for (const g of afectados) {
  const total = db.prepare('select count(*) n from partidos where temporada=? and competicion=? and grupo=?').get(g.temporada, g.competicion, g.grupo).n;
  const equipos = db.prepare(`select distinct n from (select local n from partidos where temporada=? and competicion=? and grupo=?
      union select visitante from partidos where temporada=? and competicion=? and grupo=?)`).all(g.temporada, g.competicion, g.grupo, g.temporada, g.competicion, g.grupo);
  const dir = dirDe(g.temporada, g.competicion, g.grupo);
  const html = dir ? leer(join(dir, 'clasificacion.html')) : null;
  let enlaces = new Map();
  if (html) {
    const raizHtml = parse(html);
    for (const a of raizHtml.querySelectorAll('a[href*="codequipo="]')) {
      const m = /codequipo=(\d+)/i.exec(a.getAttribute('href') ?? '');
      const nombre = a.text.replace(/\s+/g, ' ').trim();
      if (m && nombre) enlaces.set(normalizaNombreEquipo(separaNombreYEstado(nombre).nombreEquipo), m[1]);
    }
  }
  if (html) conClasif++; else sinClasif++;
  if (enlaces.size) conEnlaces++;
  // ¿Cuántos de los equipos del calendario quedarían con código con esa clasificación?
  let cubren = 0;
  for (const e of equipos) if (enlaces.has(normalizaNombreEquipo(separaNombreYEstado(e.n).nombreEquipo))) cubren++;
  console.log(`${g.temporada.padEnd(9)} ${g.competicion.padEnd(12)} ${g.grupo.padEnd(12)} ${String(g.casos).padStart(8)} ${String(total).padStart(9)} ${String(equipos.length).padStart(8)} ${(html ? 'sí' : 'NO').padStart(13)} ${String(enlaces.size).padStart(10)} ${String(cubren).padStart(7)}`);
  detalle.push({ ...g, total, equipos: equipos.length, enlaces: enlaces.size, cubren, html: Boolean(html) });
}
console.log(`\ngrupos afectados: ${afectados.length} · con clasificación: ${conClasif} · sin ella: ${sinClasif} · con enlaces codequipo: ${conEnlaces}`);
const casos = detalle.reduce((a, d) => a + d.casos, 0);
const cubiertos = detalle.filter((d) => d.cubren === d.equipos).reduce((a, d) => a + d.casos, 0);
console.log(`casos en grupos donde la clasificación cubriría TODOS los equipos: ${cubiertos} de ${casos}`);
db.close();
