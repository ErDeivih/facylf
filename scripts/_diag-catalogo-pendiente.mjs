#!/usr/bin/env node
/** Qué le falta al catálogo de Cataluña: competiciones sin identificador y grupos sin resolver. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const d = JSON.parse(readFileSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'catalogo-fcf.json'), 'utf8'));
let sinId = 0; let gruposSinId = 0;
for (const t of d.temporadas ?? []) {
  for (const disc of t.disciplinas ?? []) {
    for (const c of disc.competiciones ?? []) {
      const grupos = c.grupos ?? [];
      const pendientes = grupos.filter((g) => !g.id).length;
      if (!c.id || pendientes) {
        sinId += c.id ? 0 : 1;
        gruposSinId += pendientes;
        console.log(`  ${t.nombre} · ${disc.nombre} · ${String(c.nombre).slice(0, 46).padEnd(48)}` +
          ` id=${c.id ?? 'SIN ID'} · grupos ${grupos.length} (sin id ${pendientes})`);
      }
    }
  }
}
console.log(`competiciones sin identificador: ${sinId} · grupos sin identificar: ${gruposSinId}`);
console.log('incidencias:', JSON.stringify((d.incidencias ?? []).slice(-2)));
