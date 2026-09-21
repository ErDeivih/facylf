/*
 * ¿EN QUÉ SE VA EL TIEMPO ENTRE PETICIÓN Y PETICIÓN? Lee el registro de una federación en vivo y pone a cada
 * línea el tiempo transcurrido desde la anterior.
 *
 * Es la medición que faltaba: la cola dice cuándo se pidió cada página y cuánto tardó en llegar, pero entre dos
 * peticiones hay trabajo que no sale en la tabla (analizar el HTML, guardar el JSON, escribir en SQLite,
 * reciclar el navegador, medir su memoria). Con los tiempos de las líneas se ve cuál de esos tramos se come el
 * rato, en vez de suponerlo.
 *
 * Sólo lee. Uso: node scripts/_diag-ciclo.mjs <federacion> [segundos=150]
 */
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federacion = process.argv[2] ?? 'andalucia';
const segundos = Number(process.argv[3] ?? 150);
const registro = join(raiz, `descargas-${federacion}`, 'recolector-local', 'worker-programado.log');
if (!existsSync(registro)) { console.log('no hay registro'); process.exit(0); }

let tamano = statSync(registro).size;
let anterior = Date.now();
const inicio = anterior;
console.log(`═══ ${federacion}: ciclo real del worker (ms desde la línea anterior) · ${segundos} s`);
const interesantes = /(→ |✓ |… pausa|reciclado|limpieza|mantenimiento|↻ |! |✗ |⛔|◷|error)/;

while (Date.now() - inicio < segundos * 1000) {
  await new Promise((r) => setTimeout(r, 400));
  const nuevo = statSync(registro).size;
  if (nuevo <= tamano) continue;
  // OJO: `size` son BYTES y hay miles de caracteres de varios bytes (✓, →, …, acentos). Cortar una cadena
  // leída como texto con un desplazamiento en bytes lee trozos desplazados y el filtro no reconoce nada: se
  // corta el BÚFER por bytes y se decodifica el trozo.
  const trozo = readFileSync(registro).subarray(tamano).toString('utf8');
  tamano = nuevo;
  const ahora = Date.now();
  for (const linea of trozo.split('\n')) {
    const limpia = linea.trim();
    if (!limpia) continue;
    if (interesantes.test(limpia)) {
      console.log(`  +${String(ahora - anterior).padStart(6)} ms │ ${limpia.slice(0, 120)}`);
      anterior = ahora;
    }
  }
}
console.log('  (fin de la ventana)');
