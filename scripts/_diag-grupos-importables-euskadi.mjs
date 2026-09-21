#!/usr/bin/env node
/** SÓLO LECTURA: qué grupos de Euskadi quedan importables tras la reconstrucción. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ruta = process.argv[2] ?? resolve(
  import.meta.dirname, '..', 'pruebas', 'reconstruccion', 'ciclo', 'pruebas', 'reconstruccion',
  'euskadi-4805c98f755abe46.manifiesto.json',
);
const m = JSON.parse(readFileSync(ruta, 'utf8'));
const g = new Map();
for (const j of m.jornadas) {
  const k = `${j.temporada}|${j.competicion}|${j.grupo}`;
  if (!g.has(k)) g.set(k, { grupo: j.grupo, comp: j.competicion, temp: j.temporada, cambios: 0, ambiguos: 0, jornadas: 0 });
  const v = g.get(k);
  v.cambios += j.cambios.length; v.ambiguos += j.ambiguos.length; v.jornadas++;
}
const valores = [...g.values()];
const limpios = valores.filter((v) => v.cambios > 0 && v.ambiguos === 0).sort((a, b) => b.cambios - a.cambios);
console.log(`grupos con correcciones: ${valores.filter((v) => v.cambios > 0).length}`);
console.log(`  de ellos, SIN ninguna ambigüedad (importables): ${limpios.length}`);
console.log(`  de ellos, con alguna ambigüedad (su lote se detiene): ${valores.filter((v) => v.cambios > 0 && v.ambiguos > 0).length}`);
for (const v of limpios.slice(0, 15)) {
  console.log(`    t${v.temp} c${v.comp} g${v.grupo} · ${v.cambios} correcciones en ${v.jornadas} jornadas`);
}
