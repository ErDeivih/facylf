#!/usr/bin/env node
/*
 * Muestra la distribución de la duración TOTAL de cada trabajo medido, y los más lentos con su desglose.
 *
 * Sirve para la pregunta que no cierra: la suma de las fases da un ciclo de 8-11 s, pero el ritmo real de la
 * federación son ~25 s por petición. Si esa diferencia está DENTRO de algunos trabajos, aquí se ve: saldrán
 * trabajos con `totalMs` de minutos, y con su desglose se sabrá en qué fase.
 *
 * Uso: node analiza-trabajos-lentos.mjs <federación> [cuántos]
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const CUANTOS = Number(process.argv[3] ?? 10);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'perf-fases.jsonl');
if (!existsSync(ruta)) {
  console.error(`no existe la telemetría de ${FEDERACION}`);
  process.exit(2);
}

const filas = [];
for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
  if (!linea.trim()) continue;
  try { filas.push(JSON.parse(linea)); } catch { /* línea a medias */ }
}
if (!filas.length) {
  console.log(`${FEDERACION}: telemetría vacía`);
  process.exit(0);
}

const totales = filas.map((f) => Number(f.totalMs ?? 0)).sort((a, b) => a - b);
const p = (q) => totales[Math.min(totales.length - 1, Math.floor(q * totales.length))];

console.log(`══ ${FEDERACION} · ${filas.length} trabajos medidos ══\n`);
console.log(`  duración total: mediana ${(p(0.5) / 1000).toFixed(1)} s · `
  + `p90 ${(p(0.9) / 1000).toFixed(1)} s · p99 ${(p(0.99) / 1000).toFixed(1)} s · `
  + `máxima ${(totales[totales.length - 1] / 1000).toFixed(1)} s`);

const suma = totales.reduce((a, b) => a + b, 0);
console.log(`  suma de todos: ${(suma / 60000).toFixed(1)} min · media por trabajo ${(suma / filas.length / 1000).toFixed(1)} s\n`);

// Cuánto del tiempo total se va en los trabajos lentos: si unos pocos se llevan casi todo, ahí está el hueco.
console.log('  umbral        trabajos    tiempo total    % del tiempo medido');
for (const umbral of [15, 30, 60, 120, 300]) {
  const lentos = filas.filter((f) => Number(f.totalMs ?? 0) >= umbral * 1000);
  const t = lentos.reduce((a, f) => a + Number(f.totalMs ?? 0), 0);
  console.log(`  >= ${String(umbral).padStart(3)} s      ${String(lentos.length).padStart(8)}    `
    + `${(t / 60000).toFixed(1).padStart(9)} min    ${(100 * t / (suma || 1)).toFixed(0).padStart(5)} %`);
}

console.log(`\n  ── los ${CUANTOS} trabajos más lentos, con su desglose ──`);
const fases = ['cortesia', 'red_render', 'acta_guardar_html', 'acta_analizar', 'acta_guardar_json',
  'acta_guardar_estructura', 'acta_estructura', 'acta_reconciliar', 'acta_marcar_hecha',
  'analisis_guardado', 'cierre'];
for (const f of [...filas].sort((a, b) => Number(b.totalMs ?? 0) - Number(a.totalMs ?? 0)).slice(0, CUANTOS)) {
  const partes = fases
    .map((k) => [k, Number(f[k] ?? 0)])
    .filter(([, v]) => v >= 500)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
    .join(' · ');
  console.log(`  ${(Number(f.totalMs) / 1000).toFixed(1).padStart(7)} s  ${String(f.resultado).padEnd(6)} ${partes}`);
}
