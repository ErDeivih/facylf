#!/usr/bin/env node
/*
 * Resumen del importador a partir de su fichero de estado (`estado/importacion-resumen.json`).
 *
 * Mismo motivo que `resume-colas.mjs`: el host del servidor no tiene Node, así que esto se ejecuta dentro del
 * contenedor del monitor, que sí lo tiene y ya lleva el repositorio montado.
 *
 * Uso: docker exec facylf-monitor node /app/scripts/servidor/resume-importacion.mjs /app/estado/importacion-resumen.json
 */
import { readFileSync } from 'node:fs';

const ruta = process.argv[2] ?? '/app/estado/importacion-resumen.json';
let j;
try {
  j = JSON.parse(readFileSync(ruta, 'utf8'));
} catch (error) {
  console.log(`  no se pudo leer ${ruta}: ${error.message}`);
  process.exit(1);
}

const minutos = j.actualizado ? Math.round((Date.now() - Date.parse(j.actualizado)) / 60_000) : null;
console.log(`  unidades: ${j.hechas} hechas de ${j.unidades} · quedan ${j.pendientes}`
  + ` · apartadas ${j.apartadas} · con fallos ${j.conFallos}`);
console.log(`  filas importadas: ${Number(j.filasImportadas).toLocaleString('es-ES')}`);
console.log(`  última actividad: ${j.actualizado}${Number.isFinite(minutos) ? ` (hace ${minutos} min)` : ''}`);
