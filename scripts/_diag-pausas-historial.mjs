#!/usr/bin/env node
/** Cuenta las pausas preventivas de una federación y cuánto tiempo suman (leyendo su registro). */
import { readFileSync, existsSync } from 'node:fs';

const fed = process.argv[2] ?? 'madrid';
const ruta = `descargas-${fed}/recolector-local/worker-programado.log`;
if (!existsSync(ruta)) throw new Error(`no existe ${ruta}`);
const texto = readFileSync(ruta, 'utf8');
const lineas = texto.split('\n').filter((l) => /pausa global|pausa preventiva|Recolección en pausa|Pausa de .* h|pausa.*hasta/i.test(l));
console.log(`${fed}: ${lineas.length} líneas de pausa`);
const motivos = new Map();
for (const l of lineas.slice(-400)) {
  const m = /hasta (\d{4}-\d{2}-\d{2}T[\d:.]+Z)/.exec(l);
  const motivo = l.replace(/^\s+/, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<fecha>').slice(0, 120);
  if (m) {
    if (!motivos.has(motivo)) motivos.set(motivo, { n: 0, primera: m[1], ultima: m[1] });
    const e = motivos.get(motivo);
    e.n += 1;
    if (m[1] < e.primera) e.primera = m[1];
    if (m[1] > e.ultima) e.ultima = m[1];
  }
}
for (const [motivo, e] of [...motivos.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 6)) {
  console.log(`  ${String(e.n).padStart(3)} × desde ${e.primera} hasta ${e.ultima}`);
  console.log(`       ${motivo}`);
}
const deHoy = lineas.filter((l) => /2026-09-14/.test(l));
console.log(`\nlíneas de pausa de hoy (14/09): ${deHoy.length}`);
for (const l of deHoy.slice(-6)) console.log(`   ${l.trim().slice(0, 150)}`);
