#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿de dónde salen los códigos de equipo de Euskadi cuando el calendario no los trae?
 *
 * La clasificación archivada del grupo publica cada equipo como
 *   `<a href="NFG_VisCompeticiones_Grupo?...&codequipo=10670&..."> REAL BETIS BALOMPIE, SAD </a>`
 * es decir, la relación **código → nombre** de TODOS los equipos del grupo. Eso es exactamente la
 * jerarquía 2 del encargo («código explícito del mismo equipo en otra representación del mismo grupo y
 * temporada») y convierte la resolución por nombre en una resolución con código federativo de verdad.
 *
 * Se comprueba en cuántos grupos hace falta y en cuántos funciona.
 *
 * Uso: npx tsx scripts/_diag-catalogo-desde-clasificacion.mjs [nGrupos]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';
import { parseaClasificacionHtml } from '../packages/ingesta/src/parsers/clasificacion.js';

const nGrupos = Number(process.argv[2] ?? 400);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

/** Grupos con partidos sin código, ordenados por cuántos. */
const grupos = db.prepare(`select temporada, competicion, grupo, count(*) n
  from partidos where equipo_local_codigo is null group by 1,2,3 order by n desc limit ?`).all(nGrupos);
console.log(`grupos con partidos sin código: ${grupos.length} (de los que más tienen)\n`);

let conClasificacion = 0, conParserOk = 0, conCodequipo = 0;
let filasParser = 0, filasCodequipo = 0;
const ejemplos = [];
const sinNada = [];
for (const g of grupos) {
  let dir = null;
  for (const t of readdirSync(base)) {
    if (!t.startsWith(`t${g.temporada}-`)) continue;
    const p = join(base, t, `comp-${g.competicion}`, `grupo-${g.grupo}`);
    if (existsSync(p)) { dir = p; break; }
  }
  if (!dir) { if (sinNada.length < 5) sinNada.push(`t${g.temporada} c${g.competicion} g${g.grupo}: sin carpeta`); continue; }
  const html = leer(join(dir, 'clasificacion.html'));
  if (!html) { if (sinNada.length < 5) sinNada.push(`t${g.temporada} c${g.competicion} g${g.grupo}: sin clasificacion.html`); continue; }
  conClasificacion++;

  // (a) el parser PNFG probado
  let filas = [];
  try { filas = parseaClasificacionHtml(html); } catch { filas = []; }
  if (filas.length) { conParserOk++; filasParser += filas.length; }
  const conCodigoParser = filas.filter((f) => f.equipoCodigo).length;

  // (b) la relación código→nombre del enlace de cada equipo, leída directamente
  const raizHtml = parse(html);
  const pares = new Map();
  for (const a of raizHtml.querySelectorAll('a[href*="codequipo="]')) {
    const m = /codequipo=(\d+)/i.exec(a.getAttribute('href') ?? '');
    const nombre = a.text.replace(/\s+/g, ' ').trim();
    if (m && nombre) pares.set(m[1], nombre);
  }
  if (pares.size) { conCodequipo++; filasCodequipo += pares.size; }
  if (ejemplos.length < 6) {
    ejemplos.push(`t${g.temporada} c${g.competicion} g${g.grupo} · ${g.n} partidos sin código · clasificación ${html.length} B`
      + ` · parser PNFG ${filas.length} filas (${conCodigoParser} con código) · enlaces codequipo ${pares.size}`
      + `${pares.size ? ` → ${[...pares.entries()].slice(0, 3).map(([c, n]) => `${c}=${n}`).join(', ')}` : ''}`);
  }
}
console.log(`con clasificación archivada .......: ${conClasificacion}`);
console.log(`  el parser PNFG lee filas ........: ${conParserOk} grupos (${filasParser} filas)`);
console.log(`  hay enlaces con codequipo .......: ${conCodequipo} grupos (${filasCodequipo} pares código→nombre)`);
console.log(`\n--- ejemplos ---`);
for (const e of ejemplos) console.log(`  ${e}`);
if (sinNada.length) { console.log(`\n--- sin clasificación ---`); for (const s of sinNada) console.log(`  ${s}`); }
db.close();
