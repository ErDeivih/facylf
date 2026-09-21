/* Diagnóstico: para cada línea con U+FFFD, imprime los códigos de los caracteres que rodean la marca. */
import { readFileSync } from 'node:fs';

const RUTA = new URL('./recolector-local.mjs', import.meta.url);
const lineas = readFileSync(RUTA, 'utf8').split('\n');
lineas.forEach((l, i) => {
  let desde = 0;
  while (true) {
    const p = l.indexOf('\uFFFD', desde);
    if (p === -1) break;
    const trozo = l.slice(Math.max(0, p - 2), p + 6);
    const codigos = [...trozo].map((c) => (c === '\uFFFD' ? 'FFFD' : `${c}(${c.codePointAt(0).toString(16)})`)).join(' ');
    console.log(`linea ${String(i + 1).padStart(4)} pos ${String(p).padStart(4)}  ${codigos}`);
    desde = p + 1;
  }
});
