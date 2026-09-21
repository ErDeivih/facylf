#!/usr/bin/env node
/**
 * SÓLO LECTURA: vocabulario real de los `clasificacion.json` archivados.
 *
 * No se deduce el contrato de un solo fichero: se recorren TODOS los del corpus y se miden las formas
 * que aparecen de verdad (claves presentes, nulos, posiciones repetidas, cuadres aritméticos,
 * sanciones, duplicados y negativos). Lo que salga de aquí es lo que el adaptador tiene que aceptar; lo
 * que no salga, no se acepta.
 *
 * Uso: node scripts/_diag-vocabulario-clasificacion-json.mjs [federacion]
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const soloFederacion = process.argv[2];
const raiz = resolve(import.meta.dirname, '..');

const ficheros = [];
for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
  if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
  const federacion = entrada.name.replace(/^descargas-/, '');
  if (soloFederacion && federacion !== soloFederacion) continue;
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

console.log(`ficheros clasificacion.json encontrados: ${ficheros.length}`);
const porFederacion = new Map();
for (const f of ficheros) porFederacion.set(f.federacion, (porFederacion.get(f.federacion) ?? 0) + 1);
for (const [fed, n] of [...porFederacion.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${fed.padEnd(22)} ${n}`);

const claves = new Map();
const tipos = new Map();
let ficherosLeidos = 0, ilegibles = 0, noArray = 0, vacios = 0;
let filas = 0, codigoNoNulo = 0, sancionNoCero = 0, negativos = 0;
let puntosDescuadran = 0, jugadosDescuadran = 0, posicionesRepetidas = 0, posicionesNoConsecutivas = 0;
let nombresDuplicados = 0, equiposSinNombre = 0;
const ejemplosDescuadre = [], ejemplosSancion = [], ejemplosPosicion = [], ejemplosDuplicado = [];
const longitudes = new Map();

for (const { federacion, ruta } of ficheros) {
  let crudo;
  try { crudo = JSON.parse(readFileSync(ruta, 'utf8')); } catch { ilegibles++; continue; }
  ficherosLeidos++;
  if (!Array.isArray(crudo)) { noArray++; continue; }
  if (crudo.length === 0) { vacios++; continue; }
  longitudes.set(crudo.length, (longitudes.get(crudo.length) ?? 0) + 1);

  const vistos = new Set();
  let repeticion = false, noConsecutiva = false;
  let posicionPrevia = 0;
  for (const fila of crudo) {
    if (fila === null || typeof fila !== 'object' || Array.isArray(fila)) { equiposSinNombre++; continue; }
    for (const [k, v] of Object.entries(fila)) {
      claves.set(k, (claves.get(k) ?? 0) + 1);
      const t = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
      if (!tipos.has(k)) tipos.set(k, new Set());
      tipos.get(k).add(t);
    }
    filas++;
    const equipo = String(fila.equipo ?? '').trim();
    if (equipo === '') equiposSinNombre++;
    else if (vistos.has(equipo)) {
      nombresDuplicados++;
      if (ejemplosDuplicado.length < 6) ejemplosDuplicado.push(`${federacion} · ${equipo} · ${ruta.replace(raiz, '')}`);
    } else vistos.add(equipo);
    if (fila.equipoCodigo !== null && fila.equipoCodigo !== undefined) codigoNoNulo++;
    if (Number(fila.sancion) !== 0) {
      sancionNoCero++;
      if (ejemplosSancion.length < 8) ejemplosSancion.push(`${federacion} · ${equipo} · sancion=${fila.sancion} puntos=${fila.puntos} G-E-P=${fila.ganados}-${fila.empatados}-${fila.perdidos} · ${ruta.replace(raiz, '')}`);
    }
    for (const k of ['puntos', 'jugados', 'ganados', 'empatados', 'perdidos', 'sancion']) {
      if (typeof fila[k] === 'number' && fila[k] < 0) negativos++;
    }
    if (typeof fila.puntos === 'number' && typeof fila.ganados === 'number' && typeof fila.empatados === 'number') {
      if (fila.puntos !== 3 * fila.ganados + fila.empatados) {
        puntosDescuadran++;
        if (ejemplosDescuadre.length < 10) {
          ejemplosDescuadre.push(`${federacion} · ${equipo} · puntos ${fila.puntos} ≠ 3·${fila.ganados}+${fila.empatados}=${3 * fila.ganados + fila.empatados} (sancion ${fila.sancion}) · ${ruta.replace(raiz, '')}`);
        }
      }
    }
    if (typeof fila.jugados === 'number' && typeof fila.ganados === 'number' && typeof fila.empatados === 'number' && typeof fila.perdidos === 'number') {
      if (fila.jugados !== fila.ganados + fila.empatados + fila.perdidos) {
        jugadosDescuadran++;
        if (ejemplosDescuadre.length < 10) ejemplosDescuadre.push(`${federacion} · ${equipo} · jugados ${fila.jugados} ≠ ${fila.ganados}+${fila.empatados}+${fila.perdidos} · ${ruta.replace(raiz, '')}`);
      }
    }
    const p = Number(fila.posicion);
    if (Number.isInteger(p)) {
      if (p === posicionPrevia) repeticion = true;
      if (p < posicionPrevia) noConsecutiva = true;
      posicionPrevia = Math.max(posicionPrevia, p);
    }
  }
  if (repeticion) {
    posicionesRepetidas++;
    if (ejemplosPosicion.length < 6) ejemplosPosicion.push(`${federacion} · posiciones con empate · ${ruta.replace(raiz, '')}`);
  }
  if (noConsecutiva) {
    posicionesNoConsecutivas++;
    if (ejemplosPosicion.length < 12) ejemplosPosicion.push(`${federacion} · posiciones NO monótonas · ${ruta.replace(raiz, '')}`);
  }
}

console.log(`\nficheros leídos: ${ficherosLeidos} · ilegibles: ${ilegibles} · no-array: ${noArray} · array vacío: ${vacios}`);
console.log(`filas totales: ${filas} · filas sin nombre: ${equiposSinNombre} · equipos con código no nulo: ${codigoNoNulo}`);
console.log(`\n--- claves y tipos observados (nº de filas en que aparece) ---`);
for (const [k, n] of [...claves.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${String(n).padStart(7)} filas · tipos: ${[...(tipos.get(k) ?? [])].join(', ')}`);
}
console.log(`\n--- cuadres aritméticos ---`);
console.log(`  puntos ≠ 3·G+E ......... ${puntosDescuadran}`);
console.log(`  jugados ≠ G+E+P ........ ${jugadosDescuadran}`);
console.log(`  sancion ≠ 0 ............ ${sancionNoCero}`);
console.log(`  valores negativos ...... ${negativos}`);
console.log(`  ficheros con empates de posición ... ${posicionesRepetidas}`);
console.log(`  ficheros con posiciones no monótonas ${posicionesNoConsecutivas}`);
console.log(`  nombres de equipo duplicados en un fichero ... ${nombresDuplicados}`);
console.log(`\ndistribución de filas por fichero: ${[...longitudes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, k]) => `${n} filas ×${k}`).join(' · ')}`);
if (ejemplosDescuadre.length) console.log(`\n--- ejemplos de descuadre ---\n  ${ejemplosDescuadre.join('\n  ')}`);
if (ejemplosSancion.length) console.log(`\n--- ejemplos de sanción ---\n  ${ejemplosSancion.join('\n  ')}`);
if (ejemplosPosicion.length) console.log(`\n--- ejemplos de posición ---\n  ${ejemplosPosicion.join('\n  ')}`);
if (ejemplosDuplicado.length) console.log(`\n--- ejemplos de nombre duplicado ---\n  ${ejemplosDuplicado.join('\n  ')}`);
