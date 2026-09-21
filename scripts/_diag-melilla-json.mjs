#!/usr/bin/env node
/** Resumen del sondeo de Melilla. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ruta = join(import.meta.dirname, '..', 'descargas-federacion-sondeo', 'melilla-sondeo.json');
const d = JSON.parse(readFileSync(ruta, 'utf8'));
console.log('claves:', Object.keys(d));
console.log('portal:', d.portal, '· actualizado:', d.actualizadoEn ?? d.actualizado);
const temporadas = d.temporadas ?? [];
console.log(`temporadas: ${temporadas.length}`);
for (const t of temporadas.slice(0, 6)) {
  const claves = Object.keys(t);
  console.log(`  ${t.nombre ?? t.codigo}: ${JSON.stringify(claves)}`);
  for (const k of claves) {
    const v = t[k];
    if (Array.isArray(v)) console.log(`     ${k}: ${v.length} elementos`, v.length ? JSON.stringify(v[0]).slice(0, 200) : '');
  }
}
console.log('incidencias:', JSON.stringify((d.incidencias ?? []).slice(-4), null, 1));
