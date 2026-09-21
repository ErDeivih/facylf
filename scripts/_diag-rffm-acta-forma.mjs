#!/usr/bin/env node
/** Describe la forma exacta del JSON de acta de rffm.es a partir de una muestra guardada. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-madrid', 'recolector-local', '_muestras');
const archivo = process.argv[2] ?? join(carpeta, readdirSync(carpeta).find((f) => f.endsWith('.html')));
const html = readFileSync(archivo, 'utf8');
const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
const datos = JSON.parse(nd[1]);
console.log('claves raíz:', Object.keys(datos));
console.log('claves props:', Object.keys(datos.props ?? {}));
console.log('claves pageProps:', Object.keys(datos.props?.pageProps ?? {}));

const describe = (valor, nombre, nivel = 0) => {
  const sangria = '  '.repeat(nivel);
  if (Array.isArray(valor)) {
    console.log(`${sangria}${nombre}: array[${valor.length}]`);
    if (valor.length) describe(valor[0], '[0]', nivel + 1);
    return;
  }
  if (valor && typeof valor === 'object') {
    console.log(`${sangria}${nombre}: objeto {${Object.keys(valor).join(', ')}}`);
    if (nivel < 3) for (const [k, v] of Object.entries(valor)) describe(v, k, nivel + 1);
    return;
  }
  console.log(`${sangria}${nombre}: ${JSON.stringify(valor)?.slice(0, 80)}`);
};

for (const [k, v] of Object.entries(datos.props?.pageProps ?? {})) describe(v, k);
