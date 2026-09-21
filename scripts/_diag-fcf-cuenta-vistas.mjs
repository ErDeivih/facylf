#!/usr/bin/env node
/** ¿Cuántos partidos trae cada vista ya cargada? (para saber si hace falta expandir nada) */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
for (const nombre of readdirSync(carpeta).filter((f) => f.endsWith('.html'))) {
  const h = readFileSync(join(carpeta, nombre), 'utf8');
  const actas = [...new Set([...h.matchAll(/\/ca\/competicio\/acta\/(\d+)/g)].map((m) => m[1]))];
  const jornadas = [...new Set([...h.matchAll(/JORNADA (\d+)/g)].map((m) => m[1]))];
  const equipos = [...new Set([...h.matchAll(/href="\/ca\/clubs\/(\d+)\/categories\/(\d+)"/g)].map((m) => `${m[1]}/${m[2]}`))];
  const veureActa = (h.match(/VEURE ACTA/g) || []).length;
  console.log(`${nombre.padEnd(26)} actas distintas ${String(actas.length).padStart(4)} · botones VEURE ACTA ${String(veureActa).padStart(4)} · jornadas ${String(jornadas.length).padStart(3)} · clubes ${equipos.length}`);
}
