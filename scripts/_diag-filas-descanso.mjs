#!/usr/bin/env node
/**
 * SÓLO LECTURA: filas de «descanso» que la cola guarda como si fueran partidos.
 *
 * En una liga de número impar de equipos cada jornada deja a uno descansando, y la página publica ese
 * bloque aparte. Si el extractor lo lee como un partido, la cola acaba con una fila que empareja a un
 * equipo real con la palabra del descanso («Descansa», «Atsedena»), sin acta, sin marcador, sin campo y
 * sin árbitro — y el importador la trata como un partido de verdad y crea una inscripción para el
 * descanso.
 *
 * Mide: cuántas hay, dónde, y si de verdad tienen forma de fila fantasma (sin acta y sin marcador).
 *
 * Uso: npx tsx scripts/_diag-filas-descanso.mjs
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');
/** Palabras con las que las fuentes publican el descanso. Se buscan como nombre de equipo. */
const PALABRAS = ['Descansa', 'Descanso', 'Atsedena', 'Atseden', 'Descans', 'Reposa'];

const filas = [];
for (const d of readdirSync(raiz)) {
  if (!d.startsWith('descargas-')) continue;
  const p = join(raiz, d, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) continue;
  const federacion = d.replace(/^descargas-/, '');
  const db = new DatabaseSync(p, { readOnly: true });
  for (const palabra of PALABRAS) {
    const r = db.prepare(`select count(*) total,
        sum(case when codigo_acta is null then 1 else 0 end) sin_acta,
        sum(case when goles_local is null and goles_visitante is null then 1 else 0 end) sin_marcador,
        sum(case when campo is null or trim(campo) = '' then 1 else 0 end) sin_campo
      from partidos where local like ? or visitante like ?`).get(`%${palabra}%`, `%${palabra}%`);
    if (r.total > 0) filas.push({ federacion, palabra, ...r });
  }
  db.close();
}

if (filas.length === 0) { console.log('Ninguna cola tiene filas de descanso como partido.'); process.exit(0); }

console.log('palabra        federación            filas  sin acta  sin marcador  sin campo');
for (const f of filas) {
  console.log(`${f.palabra.padEnd(14)} ${f.federacion.padEnd(22)} ${String(f.total).padStart(5)} ${String(f.sin_acta).padStart(9)} ${String(f.sin_marcador).padStart(13)} ${String(f.sin_campo).padStart(11)}`);
}
const total = filas.reduce((a, f) => a + f.total, 0);
const sinActaNiMarcador = filas.filter((f) => f.sin_acta === f.total && f.sin_marcador === f.total).reduce((a, f) => a + f.total, 0);
console.log(`\nTOTAL de filas de descanso guardadas como partido: ${total}`);
console.log(`  de ellas, sin acta Y sin marcador (forma de fila fantasma): ${sinActaNiMarcador}`);
console.log(`  federaciones afectadas: ${[...new Set(filas.map((f) => f.federacion))].join(', ')}`);

// Una fila fantasma empareja SIEMPRE un equipo real con la palabra del descanso. Si alguna tiene las dos
// partes como descanso, la lectura es otra y hay que mirarla.
for (const d of readdirSync(raiz)) {
  if (!d.startsWith('descargas-')) continue;
  const p = join(raiz, d, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) continue;
  const db = new DatabaseSync(p, { readOnly: true });
  const re = PALABRAS.map((x) => `local like '%${x}%' and visitante like '%${x}%'`).join(' or ');
  const ambas = db.prepare(`select count(*) n from partidos where ${re}`).get().n;
  const distintos = db.prepare(`select count(distinct local) n from partidos where ${PALABRAS.map((x) => `local like '%${x}%'`).join(' or ')}`).get().n;
  if (ambas || distintos) {
    console.log(`\n${d.replace(/^descargas-/, '')}: filas con descanso en LOS DOS lados: ${ambas} · formas distintas de descanso como local: ${distintos}`);
  }
  db.close();
}
