#!/usr/bin/env node
/**
 * SÓLO LECTURA: la unión real de los contadores que se estaban sumando.
 *
 * Construye, sobre el MISMO instante de la cola y con las funciones REALES de la herramienta, cuatro
 * conjuntos de FILAS identificadas por (temporada, competición, grupo, jornada, orden):
 *
 *   A   el calendario (nombre crudo) y el acta del partido no comparten ningún equipo
 *       A4  de esas, coinciden al quitar los 4 marcadores de estado documentados
 *       AP  de esas, sólo coinciden si ADEMÁS se quita `(P)`
 *       AO  de esas, no coinciden ni quitando `(P)`
 *   H   la fila de la cola no dice la pareja que dice su propio HTML archivado  (Clase B)
 *   M   la fila cambia al releer el HTML y el acta NO sostiene la pareja nueva   (lo que el
 *       manifiesto llama «ambigua»)
 *
 * Y enseña las intersecciones y las diferencias simétricas, que es lo que nadie había calculado.
 *
 * Uso: npx tsx scripts/_diag-union-ambiguas.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join, dirname } from 'node:path';
import { extraePartidosWidget } from './lib/recolector-local.mjs';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';
import { simula } from './reconstruir-cola.mjs';

const raiz = resolve(import.meta.dirname, '..');
const rutaCola = join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite');
const clave = (f) => `${f.temporada}|${f.competicion}|${f.grupo}|J${f.jornada ?? f.numero}|${f.orden}`;

const crudo = (s) => normalizaNombreEquipo(s);
const limpio4 = (s) => normalizaNombreEquipo(separaNombreYEstado(s).nombreEquipo);
const limpio5 = (s) => normalizaNombreEquipo(
  separaNombreYEstado(s).nombreEquipo.replace(/^\s*\(\s*p\s*\)\s*/i, '').replace(/\s*\(\s*p\s*\)\s*$/i, ''),
);
const pareja = (a, b) => [a, b].sort().join(' || ');

/* ---------------------------------------------------------------- A: calendario vs acta */
const db = new DatabaseSync(rutaCola, { readOnly: true });
const A = new Map(); // clave -> 'reparado_4' | 'depende_de_p' | 'otro'
const consulta = db.prepare(`select p.temporada, p.competicion, p.grupo, p.jornada, p.orden,
    p.local, p.visitante, a.datos
  from partidos p
  join actas a on a.temporada = p.temporada and a.competicion = p.competicion
    and a.grupo = p.grupo and a.codigo = p.codigo_acta
 where a.datos is not null`);
for (const f of consulta.iterate()) {
  let d;
  try { d = JSON.parse(f.datos); } catch { continue; }
  if (!d?.local || !d?.visitante) continue;
  if (pareja(crudo(f.local), crudo(f.visitante)) === pareja(crudo(d.local), crudo(d.visitante))) continue;
  const categoria = pareja(limpio4(f.local), limpio4(f.visitante)) === pareja(limpio4(d.local), limpio4(d.visitante))
    ? 'reparado_4'
    : (pareja(limpio5(f.local), limpio5(f.visitante)) === pareja(limpio5(d.local), limpio5(d.visitante))
      ? 'depende_de_p' : 'otro');
  A.set(clave(f), categoria);
}

/* ---------------------------------------------------------------- H: la cola vs su propio HTML */
const leerArchivo = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) {
      return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
    }
  }
  return null;
};
const H = new Map(); // clave -> { cola, html }
for (const j of db.prepare(`select temporada, competicion, grupo, numero, archivo from jornadas
    where archivo is not null order by temporada, competicion, grupo, numero`).all()) {
  const archivo = leerArchivo(j.archivo);
  if (!archivo) continue;
  const extraidos = extraePartidosWidget(archivo);
  const filas = db.prepare(`select jornada, orden, local, visitante from partidos
    where temporada = ? and competicion = ? and grupo = ? and jornada = ? order by orden`)
    .all(j.temporada, j.competicion, j.grupo, j.numero);
  for (const fila of filas) {
    const delHtml = extraidos[fila.orden];
    if (!delHtml) continue;
    if (pareja(crudo(fila.local), crudo(fila.visitante)) === pareja(crudo(delHtml.local), crudo(delHtml.visitante))) continue;
    H.set(clave({ ...j, orden: fila.orden, jornada: j.numero }), {
      cola: `${fila.local} vs ${fila.visitante}`,
      html: `${delHtml.local} vs ${delHtml.visitante}`,
    });
  }
}
db.close();

/* ---------------------------------------------------------------- M: el manifiesto */
const manifiesto = simula('euskadi');
const M = new Map();
const C = new Map();
for (const j of manifiesto.jornadas) {
  for (const a of j.ambiguos ?? []) {
    M.set(`${j.temporada}|${j.competicion}|${j.grupo}|J${j.numero}|${a.orden}`, a);
  }
  for (const c of j.cambios ?? []) {
    C.set(`${j.temporada}|${j.competicion}|${j.grupo}|J${j.numero}|${c.orden}`, c);
  }
}

/* ---------------------------------------------------------------- informes */
const conj = (m) => new Set(m.keys());
const A4 = new Set([...A].filter(([, v]) => v === 'reparado_4').map(([k]) => k));
const AP = new Set([...A].filter(([, v]) => v === 'depende_de_p').map(([k]) => k));
const AO = new Set([...A].filter(([, v]) => v === 'otro').map(([k]) => k));
const SH = conj(H);
const SM = conj(M);
const inter = (x, y) => new Set([...x].filter((k) => y.has(k)));

console.log('=== contadores, sobre la MISMA instantánea ===');
console.log(`  A  incompatibles calendario/acta ....................: ${A.size}`);
console.log(`     A4 reparado por los 4 marcadores .................: ${A4.size}`);
console.log(`     AP sólo con (P) ..................................: ${AP.size}`);
console.log(`     AO ni con (P) ....................................: ${AO.size}`);
console.log(`  H  Clase B: la cola no dice lo que dice su HTML .....: ${SH.size}`);
console.log(`  M  ambiguas del manifiesto .........................: ${SM.size}`);
console.log(`  C  correcciones deterministas del manifiesto ........: ${C.size}`);

console.log('\n=== ¿es una unión? ===');
console.log(`  |AP| + |AO|                = ${AP.size + AO.size}   (A entero)`);
console.log(`  |A| + |H|                  = ${A.size + SH.size}`);
console.log(`  |A| + |H| - |A ∩ H|        = ${A.size + SH.size - inter(conj(A), SH).size}   ← unión real`);
console.log(`  A ∩ H  (en las dos clases) = ${inter(conj(A), SH).size}`);
console.log(`  A \\ H                      = ${[...conj(A)].filter((k) => !SH.has(k)).length}`);
console.log(`  H \\ A                      = ${[...SH].filter((k) => !A.has(k)).length}`);

console.log('\n=== M (manifiesto) frente a A y H ===');
console.log(`  M ∩ A = ${inter(SM, conj(A)).size} · M ∩ H = ${inter(SM, SH).size} · M ∩ A ∩ H = ${inter(inter(SM, conj(A)), SH).size}`);
console.log(`  M \\ (A ∪ H) = ${[...SM].filter((k) => !A.has(k) && !SH.has(k)).length}`);
console.log(`  (A ∪ H) \\ M = ${[...new Set([...conj(A), ...SH])].filter((k) => !SM.has(k)).length}`);

const desglose = (s) => [...s].reduce((acc, k) => {
  const c = A.get(k); acc[c ?? 'fuera-de-A'] = (acc[c ?? 'fuera-de-A'] ?? 0) + 1; return acc;
}, {});
console.log(`  desglose de M por categoría de A: ${JSON.stringify(desglose(SM))}`);
console.log(`  desglose de H por categoría de A: ${JSON.stringify(desglose(SH))}`);

if (process.argv.includes('--detalle')) {
  console.log('\n=== filas de M que NO están en A (las que explican la diferencia) ===');
  for (const k of [...SM].filter((x) => !A.has(x))) {
    console.log(`  ${k}\n      ${JSON.stringify(M.get(k))}\n      HTML: ${JSON.stringify(H.get(k) ?? null)}`);
  }
  console.log('\n=== filas de A que NO están en M ===');
  for (const k of [...conj(A)].filter((x) => !SM.has(x))) console.log(`  ${k}  [${A.get(k)}]`);
}
const rutaJson = process.argv[process.argv.indexOf('--json') + 1];
if (process.argv.includes('--json') && rutaJson) {
  writeFileSync(rutaJson, JSON.stringify({
    A: Object.fromEntries(A), H: Object.fromEntries(H), M: Object.fromEntries(M),
  }, null, 1));
  console.log(`\n  detalle escrito en ${rutaJson}`);
}
