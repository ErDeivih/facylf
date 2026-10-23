#!/usr/bin/env node
/*
 * ¿SE PUEDE RECUPERAR LA CLASIFICACIÓN ARCHIVADA CELDA A CELDA? El diagnóstico que decide si hay que volver a
 * descargar o si el problema es del lector.
 *
 * Por qué. En Galicia y La Rioja la tabla de clasificación publica los números ofuscados: unos en un
 * pseudo-elemento CSS (`#id:before{content:"2,8158"}`), otros con una clase `fa-N` que calcula `ntype()`, y al
 * lado un `<span style="display:none">` que puede ser un señuelo. El lector de hoy mira el TEXTO de la celda, y
 * ahí no hay nada (o hay dos números distintos a la vez), así que devuelve cero filas y esas 1.380 tablas
 * quedan como «ilegibles».
 *
 * La pregunta que contesta esto: con el descifrador que YA existe (`numeroOfuscadoHtml`, el que usa el parser
 * de actas), ¿sale el valor de cada celda? Si sale, el arreglo es del LECTOR y no hay que volver a pedir ni un
 * fichero —que es lo caro—. Si no sale, entonces sí hay que archivar el DOM ya pintado.
 *
 * Uso: node scripts/_diag-clasificacion-ofuscada.mjs <ruta del archivo, con o sin .gz> [--filas 2]
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';
import { numeroOfuscadoHtml } from '../packages/ingesta/dist/src/parsers/ofuscacion.js';

const rutaPedida = process.argv[2];
const iFilas = process.argv.indexOf('--filas');
const cuantasFilas = iFilas >= 0 ? Number(process.argv[iFilas + 1] ?? 2) : 2;
if (!rutaPedida) {
  console.error('Falta la ruta del archivo archivado.');
  process.exit(1);
}
let ruta = null;
for (const candidata of [rutaPedida, `${rutaPedida}.gz`, rutaPedida.replace(/\.gz$/, '')]) {
  if (existsSync(candidata)) { ruta = candidata; break; }
}
if (ruta === null) {
  console.error(`No existe: ${rutaPedida}`);
  process.exit(1);
}
const bytes = readFileSync(ruta);
const texto = ruta.toLowerCase().endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');

const raiz = parse(texto);
const tablas = raiz.querySelectorAll('table');
/** La tabla de clasificación es la que enlaza a los equipos con `codequipo=`. */
const tabla = tablas.find((t) => /codequipo=/i.test(t.innerHTML)) ?? null;
console.log(`${ruta.replace(process.cwd(), '.')}`);
console.log(`  ${tablas.length} tabla(s) · la de clasificación: ${tabla === null ? 'NO ENCONTRADA' : 'sí'}`);
if (tabla === null) process.exit(0);

const filas = tabla.querySelectorAll('tr');
/*
 * ── QUÉ COLUMNA ES CADA CELDA, SIN ADIVINAR ───────────────────────────────────────────────────────────
 *
 * La cabecera puede ocupar dos filas (una con grupos y otra con los nombres de columna), así que se juntan
 * TODAS las celdas de cabecera por índice y se enseña la de cada columna junto a su valor. Sin esto, mapear
 * «el tercer número» a un campo es una suposición, y una suposición aquí escribe puntos donde van partidos.
 * Se considera cabecera toda fila anterior a la primera que enlace un equipo.
 */
const todas = [...filas];
const primeraDatos = todas.findIndex((f) => /codequipo=/i.test(f.innerHTML));
const cabeceras = todas.slice(0, Math.max(0, primeraDatos));
const porColumna = new Map();
for (const f of cabeceras) {
  f.querySelectorAll('th,td').forEach((c, i) => {
    const t = (c.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    porColumna.set(i, [...(porColumna.get(i) ?? []), t]);
  });
}
console.log(`  filas de cabecera: ${cabeceras.length} · la primera fila con equipo es la ${primeraDatos}`);
for (const [i, etiquetas] of [...porColumna].sort((a, b) => a[0] - b[0])) {
  console.log(`     col ${String(i).padStart(2)}: ${etiquetas.join(' / ').slice(0, 90)}`);
}

let conDescifrado = 0;
let sinDescifrado = 0;
/*
 * ── EL DESCIFRADOR NECESITA LA TABLA `eval` DE LA PÁGINA, NO SÓLO LA CELDA ─────────────────────────────
 *
 * `numeroOfuscadoHtml` saca el dígito real de la tabla numérica que va dentro del `eval(...)` empaquetado, y
 * usa la clase `fa-N` sólo como último recurso (el propio código avisa de que en las capturas por HTTP la
 * clase puede ser todavía el SEÑUELO). Si se le pasa únicamente la celda, no ve la tabla y tira de la clase.
 * Aquí se calculan las dos lecturas para poder compararlas: si no coinciden, hay que saber cuál es la buena
 * antes de tocar el lector.
 */
const tablasEval = [...texto.matchAll(/\[((?:\d+\s*,\s*){9,}\d+)\]/g)];
// El array va DENTRO de un `<script>`: así alimenta la tabla con la que `numeroOfuscadoHtml` traduce los
// `ntype(...)`, y a la vez desaparece del DOM (el descifrador borra los scripts antes de leer), que es lo que
// evita que sus 40 dígitos se concatenen con los de la celda.
const contexto = tablasEval.length > 0 ? `<script>[${tablasEval[0][1]}]</script>` : '';
console.log(`  tablas numéricas de \`eval\` en la página: ${tablasEval.length}${contexto ? ` · la primera tiene ${contexto.split(',').length} números` : ''}`);
for (const fila of filas.slice(1, 1 + cuantasFilas)) {
  const celdas = fila.querySelectorAll('td');
  if (celdas.length === 0) continue;
  console.log(`\n  ── fila de ${celdas.length} celda(s)`);
  for (const [i, celda] of celdas.entries()) {
    const crudo = celda.innerHTML ?? '';
    const textoVisible = (celda.textContent ?? '').replace(/\s+/g, ' ').trim();
    const soloCelda = numeroOfuscadoHtml(crudo);
    const conContexto = contexto === '' ? soloCelda : numeroOfuscadoHtml(`${contexto}${crudo}`);
    const tieneOfuscacion = /ntype\(|:before|:after|fa-\d/i.test(crudo);
    if (!tieneOfuscacion) continue;
    const coinciden = soloCelda === conContexto;
    const veredicto = soloCelda === null
      ? 'NO SALE'
      : !coinciden ? `DIFIEREN: sólo la celda ${soloCelda} · con la tabla eval de la página ${conContexto}`
        : textoVisible === String(soloCelda) ? `sale ${soloCelda} (igual que el texto)` : `SALE ${soloCelda} · el texto dice «${textoVisible}»`;
    if (soloCelda === null) sinDescifrado++; else conDescifrado++;
    console.log(`     celda ${String(i).padStart(2)} ofuscada: ${veredicto}`);
    if (soloCelda === null || textoVisible !== String(soloCelda)) {
      console.log(`        crudo: ${crudo.replace(/\s+/g, ' ').slice(0, 190)}`);
    }
  }
}
console.log(`\n  celdas ofuscadas: ${conDescifrado} descifradas / ${sinDescifrado} sin descifrar`);
