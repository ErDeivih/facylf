/*
 * Comprueba que el extractor que se inyecta en el navegador sigue siendo JavaScript válido.
 *
 * El extractor vive dentro de una plantilla de texto, así que `node --check` valida el fichero pero NO el
 * código que de verdad se le pasa al navegador. Este comprobador lo saca de la plantilla y lo compila.
 */
import { interpretaCabeceraJornadaFcf } from './calendario-cataluna.mjs';
import { codigoInyectable, plantillaDelExtractor } from './extractor-cataluna.mjs';

const { interpolaciones } = plantillaDelExtractor();
const cuerpo = codigoInyectable(interpretaCabeceraJornadaFcf);
console.log('extractor inyectable:', cuerpo.length, 'caracteres ·', interpolaciones.length, 'interpolación(es)');
for (const i of interpolaciones) console.log('   ', i);
if (/function interpretaCabeceraJornadaFcf/.test(cuerpo)) {
  console.log('  la cabecera queda definida dentro del código inyectado: OK');
} else {
  console.error('  la cabecera NO queda definida dentro del código inyectado');
  process.exit(1);
}
try {
  // El cuerpo usa `await` de nivel superior porque Selenium lo ejecuta como script asíncrono.
  new Function(`return (async () => {${cuerpo}})();`);
  console.log('sintaxis del extractor inyectado: OK');
} catch (error) {
  console.error('ERROR de sintaxis en el extractor:', error.message);
  process.exit(1);
}
for (const esperado of ['esAjena', 'cabeceraFila.parentElement']) {
  console.log(`  contiene «${esperado}»:`, cuerpo.includes(esperado));
}
