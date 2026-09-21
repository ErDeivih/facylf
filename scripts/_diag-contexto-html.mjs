#!/usr/bin/env node
/** Diagnóstico de SÓLO LECTURA: contexto HTML alrededor de un equipo en una página archivada. */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';

const ruta = process.argv[2];
const buscado = process.argv[3] ?? 'Almazán';
const candidatas = [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')];
const existente = candidatas.find((r) => existsSync(r));
if (!existente) throw new Error(`no existe ${ruta}`);
const html = /\.gz$/i.test(existente) ? gunzipSync(readFileSync(existente)).toString('utf8') : readFileSync(existente, 'utf8');
console.log(`${existente} · ${html.length} caracteres · buscando «${buscado}»`);

const re = new RegExp(buscado, 'gi');
let n = 0;
for (const m of html.matchAll(re)) {
  n++;
  if (n > 6) break;
  console.log(`\n--- aparición ${n} en el offset ${m.index} ---`);
  console.log(html.slice(Math.max(0, m.index - 1400), m.index + 500).replace(/\s+/g, ' '));
}

/* Las tablas que nuestro extractor mira: cuántos enlaces de equipo tiene cada una. */
const raiz = parse(html);
const tablas = raiz.querySelectorAll('table');
console.log(`\ntablas en la página: ${tablas.length}`);
for (const [i, t] of tablas.entries()) {
  const enlaces = t.querySelectorAll('a[href*="NFG_VisEquipos"]');
  if (!enlaces.length) continue;
  console.log(`  tabla ${i}: ${enlaces.length} enlaces de equipo · ${enlaces.map((e) => e.text.trim()).slice(0, 6).join(' | ')}`);
}
