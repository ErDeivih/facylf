#!/usr/bin/env node
/**
 * Muestra, por federación, la ÚLTIMA vez que un worker se quedó esperando memoria, con el contexto
 * (incluida la hora de arranque de esa sesión) y el umbral que tenía entonces. Sirve para saber si el
 * guardián de memoria sigue frenando a alguien y con qué valor.
 *
 * Uso: node scripts/_diag-ultima-espera-memoria.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';

for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/worker-programado.log`;
  if (!existsSync(ruta)) continue;
  const lineas = readFileSync(ruta, 'utf8').split('\n');
  const indices = [];
  lineas.forEach((l, i) => { if (l.includes('esperando memoria libre')) indices.push(i); });
  if (!indices.length) continue;
  const i = indices[indices.length - 1];
  const umbral = /mínimo ([\d.,]+) GB/.exec(lineas[i])?.[1] ?? '?';
  // Hora de arranque más cercana por encima
  let arranque = '(sin marca)';
  for (let j = i; j >= Math.max(0, i - 40); j--) {
    const m = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+Arrancando/.exec(lineas[j]);
    if (m) { arranque = m[1]; break; }
  }
  console.log(`${d.replace('descargas-', '').padEnd(21)} última espera con umbral ${umbral.padStart(5)} GB · sesión arrancada ${arranque} · ${indices.length} esperas en total`);
}
