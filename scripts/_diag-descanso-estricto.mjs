#!/usr/bin/env node
/**
 * SÓLO LECTURA: medición ESTRICTA de las filas de descanso guardadas como partido.
 *
 * La medición anterior usaba `like '%Descans%'`, que cuenta dos veces («Descansa» contiene «Descans») y
 * puede coger nombres de club que contengan la palabra. Aquí se exige que el nombre COMPLETO del lado sea
 * la palabra de descanso (quitando los marcadores de estado), y se comprueba aparte cuántas tienen forma
 * de fila fantasma: sin acta, sin marcador, sin campo y sin árbitro.
 *
 * Uso: npx tsx scripts/_diag-filas-descanso.mjs --estricto
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');
/** Palabras de descanso, exactas tras normalizar el nombre (sin marcadores de estado). */
const PALABRAS = new Set(['descansa', 'descanso', 'atsedena', 'atseden', 'descans', 'reposa', 'bye']);

const porFederacion = new Map();
for (const d of readdirSync(raiz)) {
  if (!d.startsWith('descargas-')) continue;
  const p = join(raiz, d, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) continue;
  const federacion = d.replace(/^descargas-/, '');
  const db = new DatabaseSync(p, { readOnly: true });
  let total = 0;
  let fantasma = 0;
  let conActa = 0;
  const ejemplos = [];
  const grupos = new Set();
  for (const f of db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, local, visitante,
      goles_local gl, goles_visitante gv, campo, arbitro from partidos
    where local like '%escans%' or visitante like '%escans%' or local like '%tseden%' or visitante like '%tseden%'
       or local like '%eposa%' or visitante like '%eposa%'`).iterate()) {
    const norm = (t) => normalizaNombreEquipo(separaNombreYEstado(String(t ?? '')).nombreEquipo);
    const l = norm(f.local);
    const v = norm(f.visitante);
    if (!PALABRAS.has(l) && !PALABRAS.has(v)) continue;
    total += 1;
    grupos.add(`${f.temporada}|${f.competicion}|${f.grupo}`);
    if (f.codigo_acta) conActa += 1;
    const esFantasma = !f.codigo_acta && f.gl === null && f.gv === null && !f.campo && !f.arbitro;
    if (esFantasma) fantasma += 1;
    if (ejemplos.length < 2) ejemplos.push(`t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} ord ${f.orden}: «${f.local}» vs «${f.visitante}» · acta ${f.codigo_acta ?? 'NULL'} · ${f.gl ?? 'NULL'}-${f.gv ?? 'NULL'} · campo ${f.campo ?? 'NULL'}`);
  }
  db.close();
  if (total > 0) porFederacion.set(federacion, { total, fantasma, conActa, grupos: grupos.size, ejemplos });
}

let sumaTotal = 0;
let sumaFantasma = 0;
console.log('federación            filas  fantasma  con acta  grupos');
for (const [f, r] of [...porFederacion.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`${f.padEnd(22)} ${String(r.total).padStart(5)} ${String(r.fantasma).padStart(9)} ${String(r.conActa).padStart(9)} ${String(r.grupos).padStart(7)}`);
  sumaTotal += r.total;
  sumaFantasma += r.fantasma;
}
console.log(`\nTOTAL: ${sumaTotal} filas · ${sumaFantasma} con forma de fila fantasma (sin acta, sin marcador, sin campo, sin árbitro)`);
console.log(`el resto (${sumaTotal - sumaFantasma}) tiene acta o datos: hay que mirarlas de una en una antes de concluir nada`);
console.log('\nejemplos:');
for (const [f, r] of porFederacion) for (const e of r.ejemplos) console.log(`  ${f}: ${e}`);
