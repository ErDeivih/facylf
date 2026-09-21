#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿qué ficheros pasan el validador propuesto y por qué se rechaza el resto?
 *
 * Se aplican las reglas medidas sobre el corpus (no supuestas) y se clasifica cada fichero rechazado
 * por su causa. Es la comprobación que decide el alcance ANTES de activar el adaptador: cuántos grupos
 * se quedarían sin tabla oficial y por qué.
 *
 * Reglas:
 *   R1 posición: entero, ≥1, ≤ nº de filas, ≤ índice+1 y secuencia no decreciente.
 *   R2 equipo: no vacío y sin duplicados.
 *   R3 jugados = ganados + empatados + perdidos.
 *   R4 puntos ≤ 3·ganados + empatados (nadie saca más puntos que resultados).
 *   R5 no puede ser que TODAS las filas tengan 0 puntos habiendo victorias o empates.
 *   R6 puntos negativos sólo si puntos = 3·G + E − sanción con sanción > 0.
 *
 * Uso: node scripts/_diag-validador-json.mjs
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

const causas = new Map();
const ejemplos = [];
const porFederacion = new Map();
let pasan = 0, vacios = 0, ilegibles = 0, conAjuste = 0;

const suma = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);

for (const { federacion, ruta } of ficheros) {
  let crudo;
  try { crudo = JSON.parse(readFileSync(ruta, 'utf8')); } catch { ilegibles++; continue; }
  if (!Array.isArray(crudo)) { suma(causas, 'no es un array'); continue; }
  if (crudo.length === 0) { vacios++; continue; }

  const problemas = [];
  let anterior = 0;
  const vistos = new Set();
  let todasCero = true, algunaConResultado = false;
  for (const [i, f] of crudo.entries()) {
    const p = Number(f.posicion);
    if (!Number.isInteger(p) || p < 1 || p > crudo.length || p > i + 1) problemas.push(`R1 posición ${f.posicion} en la fila ${i}`);
    if (p < anterior) problemas.push(`R1 posición no decreciente en la fila ${i}`);
    anterior = Math.max(anterior, p);
    const nombre = String(f.equipo ?? '').trim();
    if (nombre === '') problemas.push(`R2 equipo vacío en la fila ${i}`);
    else if (vistos.has(nombre)) problemas.push(`R2 equipo duplicado «${nombre}»`);
    else vistos.add(nombre);
    const j = Number(f.jugados), g = Number(f.ganados), e = Number(f.empatados), pe = Number(f.perdidos);
    const pts = Number(f.puntos), san = Number(f.sancion ?? 0);
    if ([j, g, e, pe, pts, san].some((v) => !Number.isInteger(v))) problemas.push(`R7 valor no entero en «${nombre}»`);
    if (j !== g + e + pe) problemas.push(`R3 jugados ${j} ≠ ${g}+${e}+${pe} en «${nombre}»`);
    if (pts > 3 * g + e) problemas.push(`R4 puntos ${pts} > 3·${g}+${e} en «${nombre}»`);
    if (pts !== 0) todasCero = false;
    if (g + e > 0) algunaConResultado = true;
    if (pts < 0 && !(pts === 3 * g + e - san && san > 0)) problemas.push(`R6 puntos negativos sin sanción en «${nombre}»`);
    if (pts < 3 * g + e) conAjuste++;
  }
  if (todasCero && algunaConResultado) problemas.push('R5 todas las filas con 0 puntos habiendo resultados');

  if (problemas.length === 0) {
    pasan++;
    suma(porFederacion, `${federacion}|pasa`);
    continue;
  }
  const clase = [...new Set(problemas.map((p) => p.split(' ')[0]))].join('+');
  suma(causas, clase);
  suma(porFederacion, `${federacion}|rechaza`);
  if (ejemplos.length < 25) ejemplos.push(`${federacion} · ${clase} · ${crudo.length} filas · ${ruta.replace(raiz, '')}\n      ${problemas[0]}`);
}

console.log(`ficheros: ${ficheros.length} · ilegibles: ${ilegibles} · vacíos (array []): ${vacios}`);
console.log(`PASAN el validador: ${pasan} · rechazados: ${[...causas.values()].reduce((a, b) => a + b, 0)}`);
console.log(`filas con ajuste (puntos < 3·G+E, se registran): ${conAjuste}`);
console.log(`\n--- causas de rechazo ---`);
for (const [k, n] of [...causas.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(30)} ${n}`);
console.log(`\n--- por federación ---`);
for (const [k, n] of [...porFederacion.entries()].sort()) console.log(`  ${k.padEnd(28)} ${n}`);
if (ejemplos.length) console.log(`\n--- ejemplos ---\n  ${ejemplos.join('\n  ')}`);
