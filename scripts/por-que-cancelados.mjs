/*
 * ¿Por qué se canceló el trabajo de una temporada? Agrupa los motivos de los trabajos cancelados.
 *
 * Medido el 06/10/2026: Valencia 2024-25 tiene 6.649 trabajos CANCELADOS y **cero actas guardadas**, mientras
 * su 2025-26 lleva 70.882 actas y su 2023-24 lleva 4.361. Las demás temporadas tienen entre 0 y 209
 * cancelaciones. No es un hueco de recolección: algo falló en ese año concreto.
 *
 * El motivo está guardado en el propio trabajo (`ultimo_error`), y agrupado dice más que cualquier lista.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/por-que-cancelados.mjs <cola.sqlite> <temporada>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, temporada] = process.argv.slice(2);
if (!ruta || !temporada || !existsSync(ruta)) { console.error('uso: por-que-cancelados.mjs <cola.sqlite> <temporada>'); process.exit(2); }
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
try {
  const total = db.prepare(`select count(*) n from trabajos where temporada = ? and estado='cancelado'`).get(String(temporada)).n;
  console.log(`\n  temporada ${temporada}: ${total} trabajos cancelados`);
  console.log('  motivos (los 8 más repetidos):');
  for (const f of db.prepare(`select coalesce(ultimo_error,'(sin motivo)') e, count(*) n, group_concat(distinct tipo) tipos
      from trabajos where temporada = ? and estado='cancelado' group by 1 order by n desc limit 8`).all(String(temporada))) {
    console.log(`    ${String(f.n).padStart(6)}  [${f.tipos}]  ${String(f.e).slice(0, 100)}`);
  }
  // Y cuántos intentos llevaban: un cancelado tras 3 intentos es un fallo; tras 200, un bucle.
  console.log('  intentos que llevaban (los cancelados):');
  for (const f of db.prepare(`select intentos, count(*) n from trabajos where temporada = ? and estado='cancelado'
      group by 1 order by n desc limit 5`).all(String(temporada))) {
    console.log(`    ${String(f.intentos).padStart(4)} intentos  ${String(f.n).padStart(6)} trabajos`);
  }
} finally {
  db.close();
}
