/**
 * Saca de `scripts/recolector-cataluna-datos.mjs` el código que de verdad se inyecta en el navegador.
 *
 * Vive en una plantilla de texto, así que `node --check` valida el fichero pero no el código que se ejecuta
 * dentro de la página: hay que extraerlo, deshacer el escapado de la plantilla y compilarlo aparte. Sirve
 * para tres cosas, y las tres importan porque es donde se corrompió el calendario de Cataluña:
 *
 *   · comprobar que sigue siendo JavaScript válido (`comprueba-extractor-cataluna.mjs`);
 *   · probarlo contra un DOM de mentira con las dos maquetas conocidas (`extractor-cataluna.test.mjs`);
 *   · inyectarlo en un navegador de verdad para medir antes y después (`mide-calendario-cataluna.mjs`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARCA = 'const EXTRAE_CALENDARIO = `';

/** El texto del extractor dentro del fichero, sin tocar: tal y como está en la plantilla. */
export function plantillaDelExtractor(ruta = join(RAIZ, 'scripts', 'recolector-cataluna-datos.mjs')) {
  const fuente = readFileSync(ruta, 'utf8');
  const inicio = fuente.indexOf(MARCA);
  if (inicio < 0) throw new Error('no se encuentra EXTRAE_CALENDARIO en el recolector de Cataluña');
  const fin = fuente.indexOf('`;', inicio + MARCA.length);
  if (fin < 0) throw new Error('EXTRAE_CALENDARIO no termina con una plantilla cerrada');
  const crudo = fuente.slice(inicio + MARCA.length, fin);
  return { crudo, interpolaciones: [...crudo.matchAll(/\$\{[^}]*\}/g)].map((m) => m[0]) };
}

/**
 * El texto EXACTO que el recolector le pasa al navegador: interpolaciones resueltas y barras invertidas
 * deshechas, que es lo que hace JavaScript al construir la plantilla.
 */
export function codigoInyectable(interpretaCabeceraJornadaFcf, ruta) {
  const { crudo } = plantillaDelExtractor(ruta);
  return crudo
    .replace(/\$\{(\w+)\.toString\(\)\}/g, (_, nombre) => (nombre === 'interpretaCabeceraJornadaFcf'
      ? interpretaCabeceraJornadaFcf.toString()
      : 'null'))
    .replace(/\$\{[^}]*\}/g, 'null')
    .replace(/\\\\/g, '\\');
}

/**
 * Compila el extractor para poder ejecutarlo en Node con un DOM de mentira. `setTimeout` se sustituye por
 * uno inmediato: lo único que hace el extractor con él es esperar a que la página repinte tras un clic.
 */
export function compilaExtractor({ document, interpretaCabeceraJornadaFcf, setTimeout: temporizador }) {
  const cuerpo = codigoInyectable(interpretaCabeceraJornadaFcf);
  const fabrica = new Function('document', 'setTimeout', `return (async () => {${cuerpo}})();`);
  return () => fabrica(document, temporizador ?? ((fn) => { fn(); return 0; }));
}
