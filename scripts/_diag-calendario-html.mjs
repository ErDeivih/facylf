#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿el calendario reconstruido DESDE EL HTML ARCHIVADO cuadra?
 *
 * Toma las 38 páginas de jornada archivadas, las lee con el extractor actual y comprueba los
 * invariantes de una liga regular de 19 equipos: 36 partidos por equipo, cada pareja dos veces y una
 * en cada campo. Si el calendario del HTML cuadra y el de la cola no, la cola es una lectura vieja.
 *
 * Uso: node scripts/_diag-calendario-html.mjs [temporada] [etiqueta] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { extraePartidos } from './lib/recolector-local.mjs';

const [temporada = '20', etiqueta = '2024-25', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-federacion', 'recolector-local', `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

const filas = [];
for (let n = 1; n <= 38; n++) {
  const html = leer(join(base, 'jornadas', `jornada-${n}.html.gz`));
  if (!html) { console.log(`J${n}: sin HTML`); continue; }
  for (const p of extraePartidos(html)) filas.push({ jornada: n, ...p });
}
console.log(`partidos leídos del HTML archivado: ${filas.length}`);

const analiza = (etiqueta_, datos) => {
  const equipos = [...new Set(datos.flatMap((f) => [f.local, f.visitante]))].sort((a, b) => a.localeCompare(b, 'es'));
  const cuenta = new Map(equipos.map((e) => [e, 0]));
  const par = new Map();
  for (const f of datos) {
    cuenta.set(f.local, cuenta.get(f.local) + 1);
    cuenta.set(f.visitante, cuenta.get(f.visitante) + 1);
    const k = [f.local, f.visitante].sort((a, b) => a.localeCompare(b, 'es')).join(' || ');
    if (!par.has(k)) par.set(k, []);
    par.get(k).push(f);
  }
  const desviados = [...cuenta.entries()].filter(([, n]) => n !== 36);
  const irregulares = [...par.entries()].filter(([, v]) => v.length !== 2);
  const mismoCampo = [...par.values()].filter((v) => v.length === 2 && v[0].local === v[1].local);
  console.log(`\n=== ${etiqueta_} ===`);
  console.log(`  equipos: ${equipos.length} · partidos: ${datos.length} (esperados ${equipos.length * 36})`);
  console.log(`  equipos que no juegan 36: ${desviados.length}${desviados.length ? ` → ${desviados.map(([e, n]) => `${e} (${n})`).join(', ')}` : ''}`);
  console.log(`  parejas con recuento ≠ 2: ${irregulares.length}${irregulares.length ? ` → ${irregulares.map(([k, v]) => `${k} (${v.length})`).slice(0, 8).join(' · ')}` : ''}`);
  console.log(`  parejas con dos veces el mismo campo: ${mismoCampo.length}`);
  return { desviados: desviados.length, irregulares: irregulares.length, mismoCampo: mismoCampo.length };
};

const delHtml = analiza('calendario reconstruido del HTML archivado', filas);
const deCola = analiza('calendario de la cola (partidos)', db.prepare(`select jornada, local, visitante
  from partidos where temporada=? and competicion=? and grupo=?`).all(temporada, competicion, grupo));

/* Diferencias jornada a jornada entre las dos lecturas. */
console.log('\n=== diferencias HTML ↔ cola ===');
const porJornada = (datos) => {
  const m = new Map();
  for (const f of datos) { if (!m.has(f.jornada)) m.set(f.jornada, []); m.get(f.jornada).push(f); }
  return m;
};
const h = porJornada(filas), c = porJornada(db.prepare(`select jornada, local, visitante
  from partidos where temporada=? and competicion=? and grupo=?`).all(temporada, competicion, grupo));
for (const [j, v] of [...c.entries()].sort((a, b) => a[0] - b[0])) {
  const a = new Set((h.get(j) ?? []).map((f) => `${f.local} || ${f.visitante}`));
  const b = new Set(v.map((f) => `${f.local} || ${f.visitante}`));
  const soloCola = [...b].filter((x) => !a.has(x));
  const soloHtml = [...a].filter((x) => !b.has(x));
  if (!soloCola.length && !soloHtml.length) continue;
  console.log(`  J${j}:`);
  for (const x of soloCola) console.log(`     cola: ${x}`);
  for (const x of soloHtml) console.log(`     html: ${x}`);
}
console.log(`\nresumen: HTML desviados=${delHtml.desviados} irregulares=${delHtml.irregulares} · cola desviados=${deCola.desviados} irregulares=${deCola.irregulares}`);
db.close();
