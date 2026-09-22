#!/usr/bin/env node
/*
 * Resumen de la flota a partir de la foto que escribe el monitor (`estado/colas.json`).
 *
 * Existe porque el SERVIDOR NO TIENE NODE en el host: los guiones de `scripts/servidor/` que necesitan leer JSON
 * tienen que correr dentro de un contenedor que sí lo tenga (el monitor mismo, que ya lleva el repositorio
 * montado). Medido el 22/09/2026: `estado-general.sh` intentaba `node -e` en el host y no imprimía nada.
 *
 * Uso (dentro del contenedor del monitor):
 *   docker exec facylf-monitor node /app/scripts/servidor/resume-colas.mjs /app/estado/colas.json
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2] ?? '/app/estado/colas.json';
let foto;
try {
  foto = JSON.parse(readFileSync(ruta, 'utf8'));
} catch (error) {
  console.log(`  no se pudo leer ${ruta}: ${error.message}`);
  process.exit(1);
}

const federaciones = Object.values(foto).filter((f) => !String(f.federacion).startsWith('prueba'));
const cuenta = {};
for (const f of federaciones) cuenta[f.estado] = (cuenta[f.estado] ?? 0) + 1;
const ilegibles = federaciones.filter((f) => !f.colaLegible).map((f) => f.federacion);
const peticiones = federaciones.reduce((a, f) => a + (f.peticionesVentana ?? 0), 0);
const fallos = federaciones.reduce((a, f) => a + (f.fallosVentana ?? 0), 0);
const pendientes = federaciones.reduce((a, f) => a + (f.pendientes ?? 0), 0);

console.log(`  federaciones: ${federaciones.length} · `
  + Object.entries(cuenta).map(([estado, n]) => `${estado} ${n}`).join(' · '));
console.log(`  peticiones en la ventana: ${peticiones} · fallos: ${fallos} · `
  + (peticiones ? `${((100 * fallos) / peticiones).toFixed(1)} % de fallo` : 'sin peticiones'));
console.log(`  colas ilegibles: ${ilegibles.length ? ilegibles.join(', ') : 'ninguna'}`);
console.log(`  trabajo pendiente: ${pendientes.toLocaleString('es-ES')}`);
