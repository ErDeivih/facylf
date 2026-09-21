#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿cuadra `puntos` con `3·G + E − sanción`?
 *
 * Es la comprobación que decide qué se puede aceptar y qué tiene que detener el lote. Se mide por
 * fichero para saber el alcance ANTES de activar el adaptador: si un fichero no cuadra, ese grupo no
 * se importa (y hay que mirarlo), no se «arregla» a mano.
 *
 * Uso: node scripts/_diag-cuadre-puntos-json.mjs
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

const resumen = new Map();
const descuadres = [];
let totalFilas = 0, filasOk = 0, filasConSancion = 0, filasNegativas = 0;
for (const { federacion, ruta } of ficheros) {
  let crudo;
  try { crudo = JSON.parse(readFileSync(ruta, 'utf8')); } catch { continue; }
  if (!Array.isArray(crudo) || crudo.length === 0) { resumen.set(`${federacion}|vacio`, (resumen.get(`${federacion}|vacio`) ?? 0) + 1); continue; }
  let malas = 0;
  const detalles = [];
  for (const fila of crudo) {
    totalFilas++;
    const sancion = Number(fila.sancion ?? 0);
    const esperado = 3 * Number(fila.ganados) + Number(fila.empatados) - sancion;
    if (sancion !== 0) filasConSancion++;
    if (Number(fila.puntos) < 0) filasNegativas++;
    if (Number(fila.puntos) === esperado) { filasOk++; continue; }
    malas++;
    if (detalles.length < 3) detalles.push(`${fila.equipo}: puntos ${fila.puntos} ≠ 3·${fila.ganados}+${fila.empatados}−${sancion} = ${esperado}`);
  }
  const clave = `${federacion}|${malas === 0 ? 'cuadra' : 'descuadra'}`;
  resumen.set(clave, (resumen.get(clave) ?? 0) + 1);
  if (malas > 0 && descuadres.length < 40) {
    descuadres.push({ federacion, ruta: ruta.replace(raiz, ''), filas: crudo.length, malas, detalles });
  }
}

console.log(`filas medidas: ${totalFilas} · cuadran con 3·G+E−sanción: ${filasOk} (${(100 * filasOk / totalFilas).toFixed(1)} %)`);
console.log(`filas con sanción ≠ 0: ${filasConSancion} · filas con puntos negativos: ${filasNegativas}`);
console.log(`\nficheros por federación y veredicto:`);
for (const [k, n] of [...resumen.entries()].sort()) console.log(`  ${k.padEnd(28)} ${n}`);
console.log(`\n--- ficheros que NO cuadran (${descuadres.length} mostrados) ---`);
for (const d of descuadres) {
  console.log(`  ${d.federacion} · ${d.filas} filas · ${d.malas} malas · ${d.ruta}`);
  for (const x of d.detalles) console.log(`      ${x}`);
}
