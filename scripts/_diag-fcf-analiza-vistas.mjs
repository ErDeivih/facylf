#!/usr/bin/env node
/** Analiza las vistas ya renderizadas de un grupo de la FCF y describe cómo extraer los datos. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', '_muestras');
for (const nombre of readdirSync(carpeta).filter((f) => f.endsWith('.html'))) {
  const h = readFileSync(join(carpeta, nombre), 'utf8');
  console.log(`\n########## ${nombre} (${h.length} B)`);
  const enlaces = [...new Set([...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => /acta|alineacion|partit|fitxa|jugador|equip/i.test(u)))];
  console.log('enlaces de datos:', JSON.stringify(enlaces.slice(0, 20), null, 1));
  console.log('elementos con «ACTA»:', (h.match(/ACTA[^<]{0,20}/g) || []).slice(0, 6));
  const tabla = h.match(/<table[\s\S]*?<\/table>/);
  if (tabla) {
    const filas = [...tabla[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].slice(0, 4).map((f) => f[0].replace(/\s+/g, ' ').slice(0, 400));
    console.log(`tabla: ${(tabla[0].match(/<tr/g) || []).length} filas · cabecera/muestra:`);
    for (const f of filas) console.log('   ', f);
  }
  const conDatos = h.match(/data-[\w-]+="[^"]*"/g);
  if (conDatos) console.log('atributos data-* (muestra):', JSON.stringify([...new Set(conDatos)].slice(0, 15)));
}
