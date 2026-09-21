#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿el HTML archivado de la jornada dice lo mismo que la cola?
 *
 * Compara `jornada-N.html.gz` (evidencia de ingesta) con las filas de `partidos` de la cola para el
 * mismo ámbito. Si discrepan, el fallo está en el recolector; si coinciden, el fallo viene de la
 * fuente. También comprueba si la segunda vuelta es el espejo de la primera.
 *
 * Uso: node scripts/_diag-html-vs-cola.mjs [temporada] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { extraePartidos } from './lib/recolector-local.mjs';

const [temporada = '20', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-federacion', 'recolector-local', `t${temporada}-2024-25`, `comp-${competicion}`, `grupo-${grupo}`);
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const dePila = db.prepare(`select jornada, orden, local, visitante, goles_local, goles_visitante
  from partidos where temporada = ? and competicion = ? and grupo = ? order by jornada, orden`)
  .all(temporada, competicion, grupo);

const porJornada = (filas) => {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.jornada)) m.set(f.jornada, []);
    m.get(f.jornada).push(f);
  }
  return m;
};
const cola = porJornada(dePila);

let discrepancias = 0;
const htmlPorJornada = new Map();
for (const [jornada, filasCola] of [...cola.entries()].sort((a, b) => a[0] - b[0])) {
  const ruta = join(base, 'jornadas', `jornada-${jornada}.html.gz`);
  let html;
  try { html = gunzipSync(readFileSync(ruta)).toString('utf8'); } catch { console.log(`J${jornada}: sin HTML archivado`); continue; }
  const filasHtml = extraePartidos(html).map((p, i) => ({ orden: i, local: p.local, visitante: p.visitante, goles_local: p.golesLocal ?? null, goles_visitante: p.golesVisitante ?? null }));
  htmlPorJornada.set(jornada, filasHtml);
  // Sólo el emparejamiento: la página de calendario no trae marcador, el de la cola viene del acta.
  const normal = (filas) => filas.map((f) => `${f.local} || ${f.visitante}`).sort();
  const a = normal(filasCola), b = normal(filasHtml);
  if (JSON.stringify(a) === JSON.stringify(b)) continue;
  discrepancias++;
  console.log(`\n⚠ J${jornada}: HTML y cola NO coinciden (cola ${a.length} · html ${b.length})`);
  for (const x of a) if (!b.includes(x)) console.log(`    sólo en la cola: ${x}`);
  for (const x of b) if (!a.includes(x)) console.log(`    sólo en el HTML: ${x}`);
}
console.log(`\njornadas comparadas: ${cola.size} · con discrepancia cola/HTML: ${discrepancias}`);

/* ¿La segunda vuelta es el espejo de la primera? (J(n+19) = J(n) con los campos invertidos) */
console.log('\nespejo de la primera vuelta (J(n+19) debe ser J(n) con local y visitante cambiados):');
let espejos = 0, rotos = 0;
for (let n = 1; n <= 19; n++) {
  const ida = cola.get(n) ?? [], vuelta = cola.get(n + 19) ?? [];
  const esperado = new Set(ida.map((f) => `${f.visitante}|${f.local}`));
  const real = new Set(vuelta.map((f) => `${f.local}|${f.visitante}`));
  const faltan = [...esperado].filter((x) => !real.has(x));
  const sobran = [...real].filter((x) => !esperado.has(x));
  if (!faltan.length && !sobran.length) { espejos++; continue; }
  rotos++;
  console.log(`  J${n}→J${n + 19}: falta el espejo de ${faltan.join(', ') || '—'} · sobra ${sobran.join(', ') || '—'}`);
}
console.log(`  espejo exacto: ${espejos}/19 · con diferencia: ${rotos}/19`);

db.close();
