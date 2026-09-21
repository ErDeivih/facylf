#!/usr/bin/env node
/**
 * Diagnóstico de sólo lectura: ¿la clasificación oficial archivada de un grupo se puede leer?
 *
 * Uso: npx tsx scripts/_diag-clasificacion-oficial.mjs <federacion> <temporadaCodigo> <etiqueta> <competicion> <grupo>
 * Ej.: npx tsx scripts/_diag-clasificacion-oficial.mjs castilla-leon 20 2024-25 11379751 11379752
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { parseaClasificacionHtml } from '../packages/ingesta/src/parsers/clasificacion.js';

const [federacion, temporada, etiqueta, competicion, grupo] = process.argv.slice(2);
const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const Raiz = resolve(import.meta.dirname, '..');
const base = join(Raiz, carpeta, 'recolector-local', `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);

for (const nombre of ['clasificacion.html.gz', 'clasificacion.html', 'clasificacion.json']) {
  const ruta = join(base, nombre);
  if (!existsSync(ruta)) continue;
  const crudo = readFileSync(ruta);
  const contenido = nombre.endsWith('.gz') ? gunzipSync(crudo) : crudo;
  console.log(`${nombre}: ${crudo.length} B${nombre.endsWith('.gz') ? ` (${contenido.length} B descomprimido)` : ''}`);
  if (nombre.endsWith('.json')) {
    console.log(contenido.toString('utf8').slice(0, 400));
    continue;
  }
  const filas = parseaClasificacionHtml(contenido);
  console.log(`filas oficiales leídas: ${filas.length}`);
  for (const fila of filas.slice(0, 4)) {
    console.log(`  ${fila.posicion}º ${fila.equipo} (cod ${fila.equipoCodigo ?? '—'}) ${fila.puntos} pts · ${fila.jugados}J ${fila.ganados}G ${fila.empatados}E ${fila.perdidos}P · sanción ${fila.sancion}`);
  }
}
