#!/usr/bin/env node
/**
 * Entrada del recolector iSquad de Madrid.
 *
 * Comparte almacenamiento, intérprete y validaciones con Valencia. Además del catálogo,
 * calendarios y clasificaciones, procesa las fichas públicas de acta disponibles en la RFFM.
 * La cobertura histórica se mide por temporada y grupo: que una ficha falte o venga incompleta no
 * convierte toda la federación en una fuente sin actas.
 */
if (!process.argv.includes('--federacion')) process.argv.push('--federacion', 'madrid');
await import('./recolector-valencia.mjs');
