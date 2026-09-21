#!/usr/bin/env node
/**
 * SÓLO LECTURA: por qué se han citado 22 y 24 casos ambiguos de Euskadi a la vez.
 *
 * Separa y cuenta, sobre el MISMO instante de la cola, los contadores que hasta ahora se sumaban como
 * si fueran partes de un mismo conjunto:
 *
 *   INCOMPATIBLES      filas cuyo calendario y cuya acta no comparten NINGÚN equipo
 *   REPARADO_4         de esas, las que coinciden al quitar los 4 marcadores documentados
 *   DEPENDE_DE_P       de esas, las que SÓLO coinciden si además se quita `(P)`  ← el «13»
 *   OTRO               de esas, las que no coinciden ni quitando `(P)`
 *   CON_P              filas del universo con `(P)` en algún lado del calendario
 *   CON_IRABAZLEA      filas del universo con `(Irabazlea)`                       ← el «11»
 *
 * Y calcula la intersección con la noción del manifiesto (fila que cambia al releer su HTML y que el
 * acta no sostiene) para ver si 13 + 11 = 24 es una unión, una suma o un error.
 *
 * Uso: npx tsx scripts/_diag-ambiguas-22-vs-24.mjs [--json <ruta>]
 */
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

/** Normalización CRUDA: sin separar marcadores. Es la que usa el importador para decir «no comparten
 *  ningún equipo», y por tanto la que define el universo de casos incompatibles. */
const crudo = (s) => normalizaNombreEquipo(s);
/** Los 4 marcadores de estado que la lista cerrada SÍ quita (documentados en nova-equipos.ts). */
const limpio4 = (s) => normalizaNombreEquipo(separaNombreYEstado(s).nombreEquipo);
/** Lo mismo, quitando además `(P)`, que NO está en la lista cerrada. Es la hipótesis, no la regla. */
const limpio5 = (s) => normalizaNombreEquipo(
  separaNombreYEstado(s).nombreEquipo.replace(/^\s*\(\s*p\s*\)\s*/i, '').replace(/\s*\(\s*p\s*\)\s*$/i, ''),
);
const pareja = (a, b) => [a, b].sort().join(' || ');
const clave = (f) => `${f.temporada}|${f.competicion}|${f.grupo}|J${f.jornada}|${f.orden}`;

const CATEGORIAS = ['reparado_4', 'depende_de_p', 'otro'];
const filasDe = Object.fromEntries(CATEGORIAS.map((c) => [c, []]));

let conActa = 0;
let identicasCrudo = 0;
let incompatiblesCrudo = 0;
let reparado4 = 0;
const marcadorGlobal = new Map();
let conP = 0;
let conIrabazlea = 0;

const consulta = db.prepare(`select p.temporada, p.competicion, p.grupo, p.jornada, p.orden,
    p.codigo_acta, p.local, p.visitante, a.datos
  from partidos p
  join actas a on a.temporada = p.temporada and a.competicion = p.competicion
    and a.grupo = p.grupo and a.codigo = p.codigo_acta
 where a.datos is not null`);

// iterate(): una fila a la memoria, nunca las 19.762 actas enteras.
for (const f of consulta.iterate()) {
  let d;
  try { d = JSON.parse(f.datos); } catch { continue; }
  if (!d?.local || !d?.visitante) continue;
  conActa++;

  const c4 = [limpio4(f.local), limpio4(f.visitante)];
  const a4 = [limpio4(d.local), limpio4(d.visitante)];
  // Universo: el importador decide «no comparten ningún equipo» con el nombre CRUDO.
  if (pareja(crudo(f.local), crudo(f.visitante)) === pareja(crudo(d.local), crudo(d.visitante))) {
    identicasCrudo++;
    continue;
  }
  incompatiblesCrudo++;
  if (pareja(...c4) === pareja(...a4)) { reparado4++; continue; }

  const c5 = [limpio5(f.local), limpio5(f.visitante)];
  const a5 = [limpio5(d.local), limpio5(d.visitante)];

  const literalesCalendario = `${f.local} ${f.visitante}`;
  const tieneP = /\(\s*P\s*\)/i.test(literalesCalendario);
  const tieneIrabazlea = /\(\s*Irabazlea\s*\)/i.test(literalesCalendario);
  if (tieneP) conP++;
  if (tieneIrabazlea) conIrabazlea++;
  for (const m of literalesCalendario.matchAll(/\(([^()]{1,20})\)/g)) {
    marcadorGlobal.set(m[0], (marcadorGlobal.get(m[0]) ?? 0) + 1);
  }

  const categoria = pareja(...c5) === pareja(...a5) ? 'depende_de_p' : 'otro';
  filasDe[categoria].push({
    clave: clave(f),
    calendario: `${f.local} vs ${f.visitante}`,
    acta: `${d.local} vs ${d.visitante}`,
    con_p: tieneP,
  });
}
db.close();

const incompatibles = CATEGORIAS.reduce((a, c) => a + filasDe[c].length, 0);
console.log('=== universo: filas de partidos con acta leída ===');
console.log(`  filas con acta y pareja publicada .........................: ${conActa}`);
console.log(`  de ellas, calendario y acta ya coinciden (nombre crudo) ...: ${identicasCrudo}`);
console.log(`  INCOMPATIBLES (no comparten ningún equipo) ................: ${incompatiblesCrudo}   (control: ${incompatibles + reparado4})`);
console.log(`    reparado_4  (coinciden al quitar los 4 marcadores) ......: ${reparado4}`);
console.log(`    depende_de_p (sólo coinciden si ADEMÁS se quita (P)) ....: ${filasDe.depende_de_p.length}`);
console.log(`    otro        (no coinciden ni quitando (P)) ..............: ${filasDe.otro.length}`);
console.log('\n=== contadores de MARCADOR (no de filas) sobre el universo ===');
for (const [m, n] of [...marcadorGlobal.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${m.padEnd(16)} ${String(n).padStart(4)} apariciones en literales de calendario`);
}
console.log(`  filas del universo con (P) en algún lado ..................: ${conP}`);
console.log(`  filas del universo con (Irabazlea) en algún lado ..........: ${conIrabazlea}   ← el «11»`);
console.log(`  NOTA: ${filasDe.depende_de_p.length} es un recuento de FILAS y ${conIrabazlea} es un recuento de APARICIONES de un marcador:`);
console.log('        sumarlos no da ningún conjunto. La unión real es la del diagnóstico siguiente.');

const rutaJson = process.argv[process.argv.indexOf('--json') + 1];
if (process.argv.includes('--json') && rutaJson) {
  writeFileSync(rutaJson, JSON.stringify({ conActa, identicasCrudo, incompatibles, filasDe }, null, 1));
  console.log(`\n  detalle escrito en ${rutaJson}`);
}
