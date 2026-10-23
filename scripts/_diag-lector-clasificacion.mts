/*
 * QUÉ FILAS SACA EL LECTOR DE VERDAD, fila a fila y con todos sus campos.
 *
 * Por qué. `pnpm importar:mira-clasificacion` enseña el TEXTO de las celdas de cada tabla, que sirve para ver
 * cómo publica la fuente, pero no dice qué filas devuelve el parser ni con qué valores. Cuando el lector cambia,
 * hace falta ver exactamente lo que va a escribir: puntos, jugados, ganados, empatados, perdidos y posición.
 *
 * Uso: node --import tsx scripts/_diag-lector-clasificacion.mts <ruta del archivo, con o sin .gz> [cuántas]
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';
import { parseaClasificacionHtml, cuentaTablasDeClasificacion } from '../packages/ingesta/src/parsers/clasificacion.js';

const rutaPedida = process.argv[2];
const cuantas = Number(process.argv[3] ?? 25);
if (!rutaPedida) {
  console.error('Falta la ruta del archivo archivado.');
  process.exit(1);
}
let ruta: string | null = null;
for (const candidata of [rutaPedida, `${rutaPedida}.gz`, rutaPedida.replace(/\.gz$/, '')]) {
  if (existsSync(candidata)) { ruta = candidata; break; }
}
if (ruta === null) {
  console.error(`No existe: ${rutaPedida}`);
  process.exit(1);
}
const bytes = readFileSync(ruta);
const texto = ruta.toLowerCase().endsWith('.gz') ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');

/*
 * `--por-tabla` pasa CADA tabla de la página al parser por separado. Es lo que permite saber si una fila que
 * falta se pierde en la tabla que se acepta o en otra: el parser recorre todas las tablas y devuelve la primera
 * que acepta, así que mirando sólo el resultado final no se sabe cuál fue.
 */
if (process.argv.includes('--por-tabla')) {
  const tablas = parse(texto).querySelectorAll('table');
  console.log(`${ruta.replace(process.cwd(), '.')} · ${tablas.length} tabla(s) en la página`);
  for (const [i, tabla] of tablas.entries()) {
    const sueltas = parseaClasificacionHtml(`<html><body>${tabla.outerHTML}</body></html>`);
    console.log(`  ── tabla ${i}: el lector saca ${sueltas.length} fila(s)`
      + (sueltas.length > 0 ? ` → ${sueltas.slice(0, 4).map((f) => `${f.posicion}.${f.equipo.slice(0, 18)} ${f.puntos}pts`).join(' | ')}` : ''));
  }
  process.exit(0);
}

const filas = parseaClasificacionHtml(texto);
console.log(`${ruta.replace(process.cwd(), '.')}`);
console.log(`  tablas de clasificación según cuentaTablasDeClasificacion: ${cuentaTablasDeClasificacion(texto)}`);
console.log(`  EL LECTOR SACA ${filas.length} fila(s)`);
const cuadran = filas.filter((f) => f.jugados === f.ganados + f.empatados + f.perdidos).length;
console.log(`  de ésas, cuadran (jugados = G+E+P): ${cuadran}`);
console.log('  pos  equipo                          pts   J   G   E   P   san  últimos');
for (const [i, f] of filas.slice(0, cuantas).entries()) {
  const marca = f.jugados === f.ganados + f.empatados + f.perdidos ? ' ' : '✗';
  console.log(`  ${marca}${String(f.posicion).padStart(2)}  ${f.equipo.slice(0, 31).padEnd(31)} `
    + `${String(f.puntos).padStart(4)} ${String(f.jugados).padStart(3)} ${String(f.ganados).padStart(3)} `
    + `${String(f.empatados).padStart(3)} ${String(f.perdidos).padStart(3)} ${String(f.sancion).padStart(4)}  ${f.ultimos.join(' ')}`);
}
