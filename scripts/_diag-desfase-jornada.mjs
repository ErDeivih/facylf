#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿la cola de una jornada coincide con el HTML archivado de esa jornada?
 *
 * Compara la lista de partidos (equipos + acta) de las dos fuentes, fila a fila y como conjunto, y
 * comprueba el hash de la página: si el hash archivado es el que la cola guardó al escribir, la fila
 * salió de ESTE HTML y el desfase es del parser; si no, la página se volvió a descargar después.
 *
 * Uso: node scripts/_diag-desfase-jornada.mjs <federacion> <temporadaInterna> <etiqueta> <competicion> <grupo> <jornada>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { extraePartidos, extraePartidosWidget } from './lib/recolector-local.mjs';

const [federacion, temporada, etiqueta, competicion, grupo, jornada] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const carpetaFederacion = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const base = join(raiz, carpetaFederacion, 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fila = db.prepare(`select jornada, orden, codigo_acta, local, visitante, equipo_local_codigo, equipo_visitante_codigo
  from partidos where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
  .all(temporada, competicion, grupo, Number(jornada));
console.log(`=== cola · grupo ${grupo} jornada ${jornada}: ${fila.length} partidos ===`);
for (const f of fila) console.log(`  ${f.orden}: ${f.local} (${f.equipo_local_codigo}) vs ${f.visitante} (${f.equipo_visitante_codigo}) · acta ${f.codigo_acta ?? '—'}`);

const carpetaGrupo = join(base, `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
let html = null, rutaUsada = null;
for (const nombre of [`jornadas/jornada-${jornada}.html.gz`, `jornadas/jornada-${jornada}.html`]) {
  const r = join(carpetaGrupo, nombre);
  if (existsSync(r)) { html = /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8'); rutaUsada = r; break; }
}
console.log(`\n=== HTML archivado ===`);
if (!html) { console.log('  (no hay HTML de esa jornada)'); }
else {
  const clasicos = extraePartidos(html);
  const widget = clasicos.length ? [] : extraePartidosWidget(html);
  const usados = clasicos.length ? clasicos : widget;
  console.log(`  ${rutaUsada.replace(raiz, '')} · ${html.length} caracteres · clásico ${clasicos.length} · widget ${widget.length}`);
  console.log(`  el HTML trae ${usados.length} partidos:`);
  for (const [i, p] of usados.entries()) {
    const enLaCola = fila.findIndex((f) => norm(f.local) === norm(p.local) && norm(f.visitante) === norm(p.visitante));
    console.log(`    ${i}: ${p.local} vs ${p.visitante} · acta ${p.codActa}  ${enLaCola >= 0 ? `→ fila ${enLaCola} de la cola` : '→ NO está en la cola'}`);
  }
  // ¿Se corresponden los conjuntos?
  const setCola = new Set(fila.map((f) => `${norm(f.local)}|${norm(f.visitante)}`));
  const setHtml = new Set(usados.map((p) => `${norm(p.local)}|${norm(p.visitante)}`));
  const soloCola = [...setCola].filter((k) => !setHtml.has(k));
  const soloHtml = [...setHtml].filter((k) => !setCola.has(k));
  console.log(`\n  sólo en la cola: ${soloCola.length} · sólo en el HTML: ${soloHtml.length}`);
  for (const k of soloCola.slice(0, 6)) console.log(`      cola: ${k.replace('|', ' vs ')}`);
  for (const k of soloHtml.slice(0, 6)) console.log(`      html: ${k.replace('|', ' vs ')}`);

  // ¿Y el acta? ¿coincide el enlace de cada partido con el de la fila de la cola?
  let desalineadas = 0;
  for (const f of fila) {
    const enHtml = usados.find((p) => norm(p.local) === norm(f.local) && norm(p.visitante) === norm(f.visitante));
    if (enHtml && String(enHtml.codActa ?? '') !== String(f.codigo_acta ?? '')) {
      desalineadas++;
      console.log(`      DESALINEADA fila ${f.orden} (${f.local} vs ${f.visitante}): cola acta ${f.codigo_acta} · html acta ${enHtml.codActa}`);
    }
  }
  console.log(`  filas con el mismo partido y OTRA acta: ${desalineadas}`);
}

/* Hash: ¿la página es la misma que se parseó para escribir estas filas? */
const guardado = db.prepare('select hash, archivo, comprobada_en from jornadas where temporada=? and competicion=? and grupo=? and numero=?')
  .get(temporada, competicion, grupo, Number(jornada));
console.log(`\n=== hash ===`);
console.log(`  jornadas.hash = ${(guardado?.hash ?? '—').slice(0, 16)} · comprobada_en ${guardado?.comprobada_en ?? '—'}`);
const filaArchivo = db.prepare('select hash, guardado_en from archivos where ruta like ?').get(`%grupo-${grupo}/jornadas/jornada-${jornada}.html%`)
  ?? db.prepare('select hash, guardado_en from archivos where ruta like ?').get(`%grupo-${grupo}\\jornadas\\jornada-${jornada}.html%`);
console.log(`  archivos.hash = ${(filaArchivo?.hash ?? '—').slice(0, 16)} · guardado_en ${filaArchivo?.guardado_en ?? '—'}`);
if (html) {
  const sha = createHash('sha256').update(Buffer.from(html, 'utf8')).digest('hex');
  console.log(`  sha256 del HTML en disco = ${sha.slice(0, 16)}`);
  console.log(`  ¿coincide con jornadas.hash? ${guardado?.hash === sha ? 'SÍ (se escribió desde este HTML)' : 'NO (la página cambió después)'}`);
  console.log(`  ¿coincide con archivos.hash? ${filaArchivo?.hash === sha ? 'SÍ' : 'NO'}`);
}
const minmax = db.prepare('select min(actualizado_en) desde, max(actualizado_en) hasta from partidos where temporada=? and competicion=? and grupo=? and jornada=?')
  .get(temporada, competicion, grupo, Number(jornada));
console.log(`  partidos.actualizado_en: ${minmax?.desde} → ${minmax?.hasta}`);
db.close();
