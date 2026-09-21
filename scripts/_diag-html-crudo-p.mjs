#!/usr/bin/env node
/**
 * SÓLO LECTURA: el marcado CRUDO alrededor de un nombre de equipo con `(P)`.
 *
 * Muestra el HTML archivado tal cual, sin interpretarlo, para ver si `(P)` lo publica la fuente, en qué
 * elemento vive (un `<span>` con clase, un `title`, un comentario) y con qué más va pegado. Es la
 * evidencia que decide si `(P)` es un estado de la competición o parte del nombre.
 *
 * Uso: npx tsx scripts/_diag-html-crudo-p.mjs --grupo 1804400 [--buscar ARRUPE] [--federacion euskadi]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const grupo = arg('grupo');
const buscar = arg('buscar');
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

// La fila con `(P)` que se quiere inspeccionar.
const fila = db.prepare(`select temporada, competicion, grupo, jornada, orden, local, visitante from partidos
  where grupo = ? and (local like '%(P)%' or visitante like '%(P)%') order by jornada, orden limit 1`).get(grupo);
if (!fila) { console.error(`El grupo ${grupo} no tiene ninguna fila con (P)`); process.exit(1); }
const j = db.prepare('select archivo from jornadas where temporada=? and competicion=? and grupo=? and numero=?')
  .get(fila.temporada, fila.competicion, fila.grupo, fila.jornada);
const html = j?.archivo ? leer(j.archivo) : null;
if (html === null) { console.error(`No se pudo leer el HTML archivado: ${j?.archivo}`); process.exit(1); }

console.log(`grupo ${grupo} · t${fila.temporada} c${fila.competicion} J${fila.jornada}`);
console.log(`  archivo: ${j.archivo}`);
console.log(`  cola local:     «${fila.local}»`);
console.log(`  cola visitante: «${fila.visitante}»`);

// Se busca por la palabra más distintiva del nombre, sin paréntesis, para no depender del marcador.
const conP = /\(P\)/i.test(fila.local) ? fila.local : fila.visitante;
const palabra = (buscar ?? conP.replace(/\([^)]*\)/g, ' ').split(/[\s,."]+/).filter((p) => p.length > 4)[0] ?? '').toUpperCase();
console.log(`  buscando la palabra más distintiva en el HTML: «${palabra}»`);

const normalizado = html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
let desde = 0;
let encontrados = 0;
for (;;) {
  const i = normalizado.toUpperCase().indexOf(palabra, desde);
  if (i < 0) break;
  encontrados += 1;
  const ini = Math.max(0, i - 500);
  const fin = Math.min(normalizado.length, i + 500);
  console.log(`\n── ocurrencia ${encontrados} (posición ${i}) ──`);
  console.log(normalizado.slice(ini, fin));
  desde = i + palabra.length;
  if (encontrados >= Number(arg('max', 2))) break;
}
if (encontrados === 0) console.log('  (la palabra no aparece en el HTML)');
console.log(`\n¿aparece el literal «(P)» en algún sitio de este HTML? ${/\(P\)/i.test(html) ? 'SÍ' : 'NO'}`);
for (const m of html.matchAll(/\(P\)/gi)) { if (!m.index) continue;
  console.log(`  …${html.replace(/\s+/g, ' ').slice(Math.max(0, m.index - 160), m.index + 60)}…`);
}
db.close();
