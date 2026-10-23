#!/usr/bin/env node
/*
 * grupos-vacios.mjs — SÓLO LEE. ¿Por qué hay grupos sin ningún partido en la cola? Para una federación y una
 * temporada, reparte los grupos vacíos según lo que dice la propia cola:
 *   · sin jornadas registradas y con trabajo pendiente      → aún no se ha llegado (cola);
 *   · sin jornadas y sin trabajo pendiente                   → nadie lo va a pedir (hueco real);
 *   · con jornadas leídas pero cero partidos                 → la página no traía partidos o no se leyó bien;
 * y enseña ejemplos con nombre, para ver si son fases sin sortear, copas, sala, etc.
 *
 * Uso: node grupos-vacios.mjs <federación> <etiqueta-temporada> [n-ejemplos]   (FACYLF_RAIZ=/app por defecto)
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [, , fed, etiqueta, nEj = '12'] = process.argv;
const ruta = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 120_000 });
const t = db.prepare('select codigo from temporadas where etiqueta=?').get(etiqueta);
if (!t) { console.log(`${fed}: no tiene ${etiqueta}`); process.exit(0); }
const filas = db.prepare(`select g.competicion, g.codigo, g.nombre gn, c.nombre cn, g.jornadas, g.comprobado_en, g.jornadas_comprobadas_en,
    (select count(*) from jornadas j where j.temporada=g.temporada and j.competicion=g.competicion and j.grupo=g.codigo) nj,
    (select count(*) from jornadas j where j.temporada=g.temporada and j.competicion=g.competicion and j.grupo=g.codigo and j.archivo is not null) njArch,
    (select group_concat(tipo||':'||estado||(case when siguiente_intento>'2090' then '@2099' else '' end), ',') from (select tipo, estado, siguiente_intento from trabajos w
       where w.temporada=g.temporada and w.competicion=g.competicion and (w.grupo=g.codigo or w.grupo is null) limit 6)) trab
  from grupos g join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
  where g.temporada=? and g.estado='presente'
    and not exists (select 1 from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo)`).all(t.codigo);
const clases = new Map();
for (const f of filas) {
  const pend = /pendiente|en_curso/.test(f.trab ?? '');
  const clase = f.nj > 0 ? (f.njArch > 0 ? 'jornadas leídas, 0 partidos' : 'jornadas sin archivo') : (pend ? 'sin jornadas, con trabajo pendiente' : 'sin jornadas NI trabajo');
  if (!clases.has(clase)) clases.set(clase, []);
  clases.get(clase).push(f);
}
console.log(`\n## ${fed} ${etiqueta}: ${filas.length} grupos vacíos`);
for (const [clase, fs] of clases) {
  console.log(`  ${clase}: ${fs.length}`);
  for (const f of fs.slice(0, Number(nEj))) {
    console.log(`     ${f.competicion}/${f.codigo} «${f.cn}» · «${f.gn}» jornadas=${f.jornadas ?? '—'} nj=${f.nj} comprobado=${(f.comprobado_en ?? '—').slice(0, 10)} trab=${f.trab ?? '—'}`);
  }
}
// Palabras de los nombres de competición de los vacíos, para ver de un vistazo qué son.
const palabras = new Map();
for (const f of filas) for (const w of new Set(`${f.cn}`.toUpperCase().split(/[^A-ZÁÉÍÓÚÑÜ0-9ª]+/).filter((x) => x.length > 3))) palabras.set(w, (palabras.get(w) ?? 0) + 1);
console.log('  palabras más repetidas en las competiciones vacías:', [...palabras].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w, n]) => `${w}×${n}`).join(' '));
db.close();
