#!/usr/bin/env node
/*
 * ── SEPARA EL GASTO FIJO DE CHROME DEL COSTE POR PÁGINA ──────────────────────────────────────────────────
 *
 * Coge las muestras de `muestrea-cpu.sh` y los inicios de petición de cada cola, y ajusta por federación:
 *
 *     cpu_segundos = gasto_fijo_por_minuto + coste_por_peticion × peticiones
 *
 * Es la diferencia que decide la estrategia, porque las dos mitades se arreglan al revés:
 *
 *   · si manda el **gasto fijo**, tener 16 navegadores abiertos se come la máquina y la solución es tener
 *     MENOS navegadores a la vez: abrir dos pestañas por federación (la idea «C» del traspaso) EMPEORARÍA;
 *   · si manda el **coste por página**, la solución es que cada página cueste menos (no renderizar, bloquear
 *     más recursos) o poner más procesador.
 *
 * Uso: node analiza-cpu-muestras.mjs <cpu-muestras.csv> <peticiones.csv>
 *   cpu-muestras.csv   → «epoch,contenedor,usage_usec» (lo genera muestrea-cpu.sh)
 *   peticiones.csv     → «federacion,iniciada_en» (una línea por petición)
 */
import { readFileSync } from 'node:fs';

const [rutaCpu, rutaPet] = process.argv.slice(2);
if (!rutaCpu || !rutaPet) {
  console.error('uso: analiza-cpu-muestras.mjs <cpu-muestras.csv> <peticiones.csv>');
  process.exit(2);
}

/** Lee el CSV de muestras y devuelve, por contenedor, la lista de [epoch, uso_us]. */
function leeMuestras(ruta) {
  const porContenedor = new Map();
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const [epoch, contenedor, uso] = linea.trim().split(',');
    if (!epoch || !contenedor || !uso) continue;
    if (!porContenedor.has(contenedor)) porContenedor.set(contenedor, []);
    porContenedor.get(contenedor).push([Number(epoch), Number(uso)]);
  }
  for (const lista of porContenedor.values()) lista.sort((a, b) => a[0] - b[0]);
  return porContenedor;
}

/** Lee las peticiones y las agrupa por federación en orden temporal (epoch en segundos). */
function leePeticiones(ruta) {
  const porFederacion = new Map();
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const [fed, iso] = linea.trim().split(',');
    if (!fed || !iso) continue;
    const t = Date.parse(iso) / 1000;
    if (!Number.isFinite(t)) continue;
    if (!porFederacion.has(fed)) porFederacion.set(fed, []);
    porFederacion.get(fed).push(t);
  }
  for (const lista of porFederacion.values()) lista.sort((a, b) => a - b);
  return porFederacion;
}

const muestras = leeMuestras(rutaCpu);
const peticiones = leePeticiones(rutaPet);

/** Regresión lineal simple: devuelve pendiente y ordenada en el origen. */
function ajusta(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const pendiente = num / den;
  return { pendiente, ordenada: my - pendiente * mx };
}

console.log('  federación            tramos  pet/min  cpu-s/min  BASE cpu-s/min  COSTE cpu-s/pet  R²');
console.log('                                                              (navegador abierto)');

const filas = [];
for (const [contenedor, lista] of [...muestras.entries()].sort()) {
  const federacion = contenedor.replace(/^facylf-/, '').replace(/-1$/, '');
  const pets = peticiones.get(federacion) ?? [];
  if (lista.length < 4) continue;

  // Cada tramo entre dos muestras consecutivas: cuánta CPU se gastó y cuántas peticiones hubo dentro.
  const xs = [];
  const ys = [];
  const minutos = [];
  for (let i = 1; i < lista.length; i += 1) {
    const [t0, u0] = lista[i - 1];
    const [t1, u1] = lista[i];
    const segundos = t1 - t0;
    if (segundos <= 0 || u1 < u0) continue;
    const cpuS = (u1 - u0) / 1e6;
    const n = pets.filter((p) => p >= t0 && p < t1).length;
    xs.push(n);
    ys.push(cpuS);
    minutos.push(segundos / 60);
  }
  const ajuste = ajusta(xs, ys);
  const petTot = xs.reduce((a, b) => a + b, 0);
  const cpuTot = ys.reduce((a, b) => a + b, 0);
  const minTot = minutos.reduce((a, b) => a + b, 0);
  if (minTot <= 0) continue;

  // R²: cuánto de la variación de CPU explica el número de peticiones.
  let r2 = null;
  if (ajuste && xs.length >= 3) {
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let ssTot = 0;
    let ssRes = 0;
    for (let i = 0; i < ys.length; i += 1) {
      ssTot += (ys[i] - my) ** 2;
      ssRes += (ys[i] - (ajuste.ordenada + ajuste.pendiente * xs[i])) ** 2;
    }
    r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
  }

  filas.push({
    federacion,
    tramos: xs.length,
    petMin: petTot / minTot,
    cpuMin: cpuTot / minTot,
    base: ajuste ? ajuste.ordenada / (cpuTot / minTot > 0 ? 1 : 1) : null,
    basePorMin: ajuste ? ajuste.ordenada / (minutos.reduce((a, b) => a + b, 0) / minutos.length) : null,
    coste: ajuste ? ajuste.pendiente : null,
    r2,
  });

  const baseMin = ajuste ? ajuste.ordenada / (minutos.reduce((a, b) => a + b, 0) / minutos.length) : null;
  console.log(`  ${federacion.padEnd(22)} ${String(xs.length).padStart(5)}  `
    + `${(petTot / minTot).toFixed(1).padStart(7)}  ${(cpuTot / minTot).toFixed(1).padStart(8)}  `
    + `${(baseMin === null ? '—' : baseMin.toFixed(1)).padStart(14)}  `
    + `${(ajuste ? ajuste.pendiente.toFixed(2) : '—').padStart(15)}  `
    + `${(r2 === null ? '—' : r2.toFixed(2)).padStart(5)}`);
}

const conAjuste = filas.filter((f) => f.coste !== null && f.basePorMin !== null);
if (conAjuste.length) {
  const baseTotal = conAjuste.reduce((a, f) => a + f.basePorMin, 0);
  const cpuTotal = filas.reduce((a, f) => a + f.cpuMin, 0);
  const conPrecio = conAjuste.reduce((a, f) => a + f.coste * f.petMin, 0);
  console.log(`\n  GASTO FIJO sumado de los navegadores:      ${baseTotal.toFixed(1)} cpu-s/min`);
  console.log(`  COSTE POR PÁGINA sumado:                   ${conPrecio.toFixed(1)} cpu-s/min`);
  console.log(`  Total medido en esos contenedores:         ${cpuTotal.toFixed(1)} cpu-s/min`);
  const base = baseTotal;
  const coste = conPrecio;
  if (base + coste > 0) {
    console.log(`\n  → El ${(100 * base / (base + coste)).toFixed(0)} % del procesador se va en TENER los navegadores abiertos`);
    console.log(`    y el ${(100 * coste / (base + coste)).toFixed(0)} % en cada página que se pide.`);
    console.log('    Si manda el gasto fijo, abrir DOS pestañas por federación empeora: reparte una CPU que ya no sobra.');
  }
}
