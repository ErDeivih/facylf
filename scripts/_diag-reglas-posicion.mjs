#!/usr/bin/env node
/**
 * SÓLO LECTURA: reglas de `posicion` y forma de `equipoCodigo` en los `clasificacion.json`.
 *
 * · ¿empieza siempre en 1? ¿es monótona? ¿sigue el rango de competición estándar (1,2,3,3,5)?
 * · ¿qué pinta tiene `equipoCodigo` cuando no es nulo, y en qué federaciones aparece?
 *
 * Uso: node scripts/_diag-reglas-posicion.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
const ficheros = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const federacion = entrada.name.replace(/^descargas-/, '');
  const base = join(raiz, entrada.name, 'recolector-local');
  if (!existsSync(base)) continue;
  const pila = [base];
  while (pila.length) {
    const actual = pila.pop();
    for (const e of readdirSync(actual, { withFileTypes: true })) {
      const ruta = join(actual, e.name);
      if (e.isDirectory()) { pila.push(ruta); continue; }
      if (e.name === 'clasificacion.json') ficheros.push({ federacion, ruta });
    }
  }
}

let noEmpiezaEnUno = 0, noMonotona = 0, fueraDeRango = 0, noRangoEstandar = 0, conEmpates = 0;
const ejemplos = [];
const codigos = new Map();
const conCodigo = new Map();
const ejemplosCodigo = [];

for (const { federacion, ruta } of ficheros) {
  let crudo;
  try { crudo = JSON.parse(readFileSync(ruta, 'utf8')); } catch { continue; }
  if (!Array.isArray(crudo) || crudo.length === 0) continue;

  const posiciones = crudo.map((f) => Number(f.posicion));
  if (posiciones[0] !== 1) {
    noEmpiezaEnUno++;
    if (ejemplos.length < 12) ejemplos.push(`NO empieza en 1 (${posiciones[0]}): ${federacion} ${ruta.replace(raiz, '')}`);
  }
  let monotona = true;
  for (let i = 1; i < posiciones.length; i++) if (posiciones[i] < posiciones[i - 1]) monotona = false;
  if (!monotona) {
    noMonotona++;
    if (ejemplos.length < 12) ejemplos.push(`NO monótona: ${federacion} ${ruta.replace(raiz, '')}`);
  }
  // Fuera de rango: una posición mayor que el número de filas, o menor que 1.
  if (posiciones.some((p, i) => p < 1 || p > crudo.length || p > i + 1)) {
    fueraDeRango++;
    if (ejemplos.length < 12) ejemplos.push(`fuera de rango: ${federacion} ${ruta.replace(raiz, '')} → ${posiciones.join(',')}`);
  }
  // Rango de competición estándar: la posición de la fila i es 1 + (nº de filas estrictamente mejores).
  const puntos = crudo.map((f) => Number(f.puntos));
  let estandar = true;
  for (let i = 0; i < crudo.length; i++) {
    const mejores = puntos.filter((p, j) => j < i && p > puntos[i]).length;
    const esperada = 1 + mejores;
    if (posiciones[i] !== esperada) estandar = false;
  }
  if (posiciones.some((p, i) => i > 1 && p === posiciones[i - 1])) conEmpates++;
  if (!estandar) noRangoEstandar++;

  for (const fila of crudo) {
    const c = fila.equipoCodigo;
    if (c === null || c === undefined) continue;
    conCodigo.set(federacion, (conCodigo.get(federacion) ?? 0) + 1);
    const forma = /^\d+$/.test(String(c)) ? 'numérico' : (/^[A-Za-z]/.test(String(c)) ? 'con letras' : 'otra');
    codigos.set(forma, (codigos.get(forma) ?? 0) + 1);
    if (ejemplosCodigo.length < 10) ejemplosCodigo.push(`${federacion} · "${c}" (${forma}) · ${ruta.replace(raiz, '')}`);
  }
}

console.log(`ficheros con filas: ${ficheros.length}`);
console.log(`\n--- posicion ---`);
console.log(`  no empieza en 1 ................. ${noEmpiezaEnUno}`);
console.log(`  no monótona ..................... ${noMonotona}`);
console.log(`  fuera de rango (<1, >filas, >i+1) ${fueraDeRango}`);
console.log(`  no sigue el rango estándar ...... ${noRangoEstandar}`);
console.log(`  ficheros con empates ............ ${conEmpates}`);
console.log(`\n--- equipoCodigo ---`);
console.log(`  filas con código por federación: ${[...conCodigo.entries()].map(([f, n]) => `${f}=${n}`).join(' · ') || 'ninguna'}`);
console.log(`  formas: ${[...codigos.entries()].map(([k, n]) => `${k}=${n}`).join(' · ') || '—'}`);
if (ejemplos.length) console.log(`\n--- ejemplos de posición ---\n  ${ejemplos.join('\n  ')}`);
if (ejemplosCodigo.length) console.log(`\n--- ejemplos de código ---\n  ${ejemplosCodigo.join('\n  ')}`);
