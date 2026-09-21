#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿coexisten `clasificacion.html` y `clasificacion.json` en el mismo grupo?
 *
 * Determina si la comparación «HTML contra JSON» del encargo es un caso vivo o teórico: si en ningún
 * grupo de ninguna cola el parser PNFG saca filas del HTML, esa comparación no puede dispararse hoy.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parseaClasificacionHtml } from '../packages/ingesta/src/parsers/clasificacion.js';

const raiz = resolve(import.meta.dirname, '..');
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const fed = entrada.name.replace(/^descargas-/, '');
  const base = join(raiz, entrada.name, 'recolector-local');
  if (!existsSync(base)) continue;
  let html = 0, json = 0, ambos = 0;
  const conAmbos = [];
  const pila = [base];
  while (pila.length) {
    const a = pila.pop();
    for (const e of readdirSync(a, { withFileTypes: true })) {
      const r = join(a, e.name);
      if (e.isDirectory()) { pila.push(r); continue; }
      const esHtml = /^clasificacion\.html(\.gz)?$/.test(e.name);
      const esJson = e.name === 'clasificacion.json';
      if (esHtml) html++;
      if (esJson) json++;
      if (!esHtml) continue;
      if (existsSync(join(a, 'clasificacion.json'))) {
        ambos++;
        if (conAmbos.length < 3) conAmbos.push({ dir: a, ruta: r });
      }
    }
  }
  console.log(`${fed.padEnd(22)} html=${String(html).padStart(4)} · json=${String(json).padStart(4)} · con AMBOS=${ambos}`);
  for (const c of conAmbos) {
    try {
      const crudo = readFileSync(c.ruta);
      const texto = c.ruta.endsWith('.gz') ? gunzipSync(crudo).toString('utf8') : crudo.toString('utf8');
      const filas = parseaClasificacionHtml(texto);
      console.log(`    ${c.ruta.replace(raiz, '')} · ${texto.length} chars · el parser PNFG lee ${filas.length} filas`);
    } catch (error) {
      console.log(`    ${c.ruta.replace(raiz, '')} · error: ${error.message.slice(0, 80)}`);
    }
  }
}
