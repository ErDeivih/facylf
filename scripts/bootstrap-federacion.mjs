#!/usr/bin/env node
/**
 * Bootstrap de una federación: convierte el JSON del sondeo (descargas-federacion-sondeo/<fed>-sondeo.json)
 * en el catálogo `descargas-<fed>/competiciones-por-temporada.json` que el recolector espera para
 * encolar (formato `{ codTemp: [{ codCompeticion, nombre }] }`). No hace peticiones: solo reordena
 * lo que ya descubrió el sondeo.
 *
 * Uso:
 *   node scripts/bootstrap-federacion.mjs --perfil perfiles/extremadura.json
 *   (después: node scripts/recolector-local.mjs --perfil perfiles/extremadura.json arrancar)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(nombre, defecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : defecto;
}

const RAIZ = resolve(import.meta.dirname, '..');
const PERFIL = arg('perfil', '');
if (!PERFIL) { console.error('Falta --perfil (p. ej. perfiles/rioja.json)'); process.exit(1); }

const perfil = JSON.parse(readFileSync(resolve(RAIZ, PERFIL), 'utf8').replace(/^\uFEFF/, ''));
const SONDEO = resolve(RAIZ, 'descargas-federacion-sondeo', `${perfil.nombre}-sondeo.json`);
const sondeo = JSON.parse(readFileSync(SONDEO, 'utf8').replace(/^\uFEFF/, ''));

// formato que espera preparaDesdeCatalogo: { codTemp: [{ codCompeticion, nombre }] }
const porTemporada = {};
for (const t of sondeo.temporadas ?? []) {
  const comps = (t.competiciones ?? [])
    .filter((c) => /^\d+$/.test(String(c.codigo ?? '')))
    .map((c) => ({ codCompeticion: String(c.codigo), nombre: String(c.nombre ?? '').trim() }));
  if (comps.length) porTemporada[t.codigo] = comps;
}

const destino = resolve(RAIZ, perfil.carpeta || `descargas-${perfil.nombre}`, 'competiciones-por-temporada.json');
mkdirSync(resolve(RAIZ, perfil.carpeta || `descargas-${perfil.nombre}`), { recursive: true });
writeFileSync(destino, JSON.stringify(porTemporada, null, 2));

const temps = Object.keys(porTemporada).length;
const comps = Object.values(porTemporada).reduce((n, l) => n + l.length, 0);
console.log(`Catálogo de ${perfil.nombre}: ${temps} temporadas, ${comps} competiciones → ${destino}`);
