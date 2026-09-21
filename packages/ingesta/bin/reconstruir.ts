#!/usr/bin/env tsx
/**
 * Reconstruye una temporada: une el calendario con los resultados de cada jornada que ya
 * se han bajado (`descargas-federacion/`) y muestra la clasificación real.
 *
 *   pnpm reconstruir --slug comp-12012-gr-47795
 */
import { resolve } from 'node:path';
import { calculaClasificacion } from '@facylf/dominio';
import { reconstruyeTemporada } from '../src/reconstruccion.js';

const RAIZ = resolve(import.meta.dirname, '../../..');
const slug = process.argv.indexOf('--slug') >= 0 ? process.argv[process.argv.indexOf('--slug') + 1] : undefined;
const carpeta = process.argv.indexOf('--carpeta') >= 0
  ? process.argv[process.argv.indexOf('--carpeta') + 1]!
  : resolve(RAIZ, 'descargas-federacion');

if (!slug) {
  console.error('Uso: pnpm reconstruir --slug <slug>   (p. ej. comp-12012-gr-47795)');
  process.exit(1);
}

const t = reconstruyeTemporada(slug, carpeta);
const tabla = calculaClasificacion(t.partidos);

console.log(`Temporada ${t.slug} — ${t.jornadas} jornadas, ${t.partidos.length} partidos, ${t.conResultado} con resultado${t.sinResultado ? `, ${t.sinResultado} sin resultado` : ''}`);
console.log('\nClasificación (calculada):');
console.log('  Pos  Equipo                          PJ  G  E  P  GF  GC  Pts');
for (const f of tabla) {
  console.log(`  ${String(f.posicion).padStart(3)}  ${f.equipo.padEnd(30)} ${String(f.jugados).padStart(2)}  ${String(f.ganados).padStart(2)}  ${String(f.empatados).padStart(2)}  ${String(f.perdidos).padStart(2)}  ${String(f.golesFavor).padStart(3)}  ${String(f.golesContra).padStart(3)}  ${String(f.puntos).padStart(3)}`);
}
