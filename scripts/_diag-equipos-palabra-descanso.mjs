#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿existe algún EQUIPO DE VERDAD cuyo nombre sea exactamente una palabra de descanso?
 *
 * Es la comprobación que autoriza —o prohíbe— la regla de corrección. La regla va a saltarse las filas
 * cuyo lado sea exactamente la palabra de descanso y que además no tengan acta. Si la fuente tuviera dado
 * de alta un equipo llamado «DESCANSA» en el catálogo, esa regla se llevaría por delante un partido real.
 *
 * Se mira el catálogo (`equipos`), que es donde la federación publica sus equipos con código. Medido
 * antes de escribir la regla, no después.
 *
 * Uso: npx tsx scripts/_diag-equipos-palabra-descanso.mjs
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');
const PALABRAS = new Set(['descansa', 'descans', 'atsedena', 'atseden', 'reposa', 'bye']);

let totalEquipos = 0;
let coincidencias = 0;
const porFederacion = [];
for (const d of readdirSync(raiz)) {
  if (!d.startsWith('descargas-')) continue;
  const p = join(raiz, d, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) continue;
  const federacion = d.replace(/^descargas-/, '');
  const db = new DatabaseSync(p, { readOnly: true });
  let equipos = 0;
  const encontrados = [];
  try {
    for (const e of db.prepare('select temporada, codigo, nombre from equipos').iterate()) {
      equipos += 1;
      const limpio = normalizaNombreEquipo(separaNombreYEstado(String(e.nombre ?? '')).nombreEquipo);
      if (PALABRAS.has(limpio)) encontrados.push(`t${e.temporada} código ${e.codigo} «${e.nombre}»`);
    }
  } catch { /* cola sin tabla equipos */ }
  db.close();
  totalEquipos += equipos;
  coincidencias += encontrados.length;
  porFederacion.push({ federacion, equipos, encontrados });
}

console.log(`equipos en el catálogo de todas las colas: ${totalEquipos}`);
console.log(`equipos cuyo nombre es EXACTAMENTE una palabra de descanso: ${coincidencias}`);
for (const f of porFederacion.filter((x) => x.encontrados.length)) {
  console.log(`\n  ${f.federacion} (${f.equipos} equipos):`);
  for (const e of f.encontrados.slice(0, 10)) console.log(`    ${e}`);
}
console.log(coincidencias === 0
  ? '\n✓ Ningún equipo real se llama exactamente «Descansa»/«Atsedena»: la regla no puede borrar un partido real.'
  : '\n✗ HAY equipos con ese nombre: la regla NO se puede aplicar a ciegas.');
