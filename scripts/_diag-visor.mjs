#!/usr/bin/env node
/**
 * Revisa lo que el visor está enseñando: estado por federación, ritmo, pausas y avisos, y marca lo
 * que no cuadra (ritmo cero sin pausa, tareas que ya no existen, inventario sospechoso, etc.).
 *
 * Uso: node scripts/_diag-visor.mjs
 */
const visor = process.argv[2] ?? 'http://127.0.0.1:3777';
const respuesta = await fetch(`${visor}/api/estado`, { signal: AbortSignal.timeout(120_000) });
if (!respuesta.ok) throw new Error(`el visor contesta HTTP ${respuesta.status}`);
const estado = await respuesta.json();
const ahora = new Date();
console.log(`visor ${visor} · ${estado.length} federaciones · consultado ${ahora.toLocaleString('es-ES')}`);
console.log('federación            tarea        estado    pend   ritmo5/10/15   s/pet  pausa  eta(d)  avisos');
const problemas = [];
for (const f of estado) {
  const ritmo = `${f.ritmo5 ?? 0}/${f.ritmo10 ?? 0}/${f.ritmo15 ?? 0}`;
  const eta = f.etaSegundos == null ? '-' : (f.etaSegundos / 86400).toFixed(1);
  const avisos = [];
  if (f.pausado) avisos.push(`PAUSA hasta ${f.pausaHasta}`);
  if (!f.pausado && (f.ritmo10 ?? 0) === 0 && (f.pend ?? 0) > 0 && f.tipo === 'cola') avisos.push('sin ritmo y con trabajo pendiente');
  if (f.sinBase) avisos.push('sin base de datos');
  if (f.catalogoSospechoso) avisos.push('catálogo sospechoso');
  if (f.nota) avisos.push(`nota: ${f.nota}`);
  if (f.tareaEstado && f.tareaEstado !== 'Ready' && f.tareaEstado !== 'Running') avisos.push(`tarea ${f.tareaEstado} (${f.tareaResultado})`);
  if (avisos.length) problemas.push(`${f.nombre}: ${avisos.join('; ')}`);
  console.log(`${f.nombre.padEnd(21)} ${String(f.tareaEstado ?? '-').padEnd(12)} ${String(f.pend ?? 0).padStart(6)} ${ritmo.padStart(14)} ${String(f.segPorPeticion ?? '-').padStart(6)} ${String(f.pausado ?? false).padStart(6)} ${eta.padStart(7)}  ${avisos.join('; ')}`);
}
console.log(`\n${problemas.length} avisos:`);
for (const p of problemas) console.log(`  · ${p}`);
