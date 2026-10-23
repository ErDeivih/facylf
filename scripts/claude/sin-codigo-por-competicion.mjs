/*
 * sin-codigo-por-competicion.mjs — SÓLO LEE. Partidos jugados (con resultado) sin código de acta, agrupados por
 * competición: para separar lo que la federación no publica (p. ej. competiciones nacionales de la RFEF que el
 * portal autonómico enseña pero cuya acta vive en otro sitio) de lo que se nos escapa.
 * Uso: node sin-codigo-por-competicion.mjs <fed> <temporada> [n]     (FACYLF_RAIZ=/app por defecto)
 */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [, , fed, et, n = '25'] = process.argv;
const db = new DatabaseSync(join(RAIZ, fed === 'castilla-leon' ? 'descargas-federacion' : `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true, timeout: 120000 });
const t = db.prepare('select codigo from temporadas where etiqueta=?').get(et);
if (!t) process.exit(0);
const filas = db.prepare(`select c.nombre comp, count(*) jugados,
    sum(case when p.codigo_acta is null or p.codigo_acta='' then 1 else 0 end) sinCodigo
  from partidos p join competiciones c on c.temporada=p.temporada and c.codigo=p.competicion
  where p.temporada=? and p.goles_local is not null group by 1 having sinCodigo > 0 order by sinCodigo desc limit ?`).all(t.codigo, Number(n));
const total = filas.reduce((s, f) => s + Number(f.sinCodigo), 0);
console.log(`\n## ${fed} ${et}: competiciones con partidos jugados sin código de acta (las ${filas.length} primeras suman ${total})`);
for (const f of filas) console.log(`  ${String(f.sinCodigo).padStart(5)} de ${String(f.jugados).padStart(5)} (${(100 * f.sinCodigo / f.jugados).toFixed(0).padStart(3)} %)  ${f.comp}`);
db.close();
