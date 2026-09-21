#!/usr/bin/env node
/** Describe el HTML guardado de un grupo de la FCF para diseñar la extracción de datos. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const carpeta = join(import.meta.dirname, '..', 'descargas-cataluna', 'grupos-html');
const archivo = process.argv[2] ?? join(carpeta, readdirSync(carpeta)[0]);
const h = readFileSync(archivo, 'utf8');
console.log(archivo, '·', h.length, 'B');
console.log('tablas:', (h.match(/<table/g) || []).length, '· enlaces:', (h.match(/<a /g) || []).length,
  '· botones:', (h.match(/<button/g) || []).length, '· NEXT_DATA:', h.includes('__NEXT_DATA__'));

const enlaces = [...new Set([...h.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^#|javascript|\.css|\.png|\.jpg|\.svg|\.woff|\.ico/.test(u)))];
console.log(`enlaces internos distintos: ${enlaces.length}`);
console.log(JSON.stringify(enlaces.slice(0, 30), null, 1));

const texto = h.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
console.log('\ntexto visible (1.500):');
console.log(texto.slice(0, 1500));

const nd = h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nd) {
  const datos = JSON.parse(nd[1]);
  console.log('\n__NEXT_DATA__ B:', nd[1].length, '· claves:', Object.keys(datos));
  const pp = datos.props?.pageProps ?? {};
  console.log('pageProps claves:', Object.keys(pp));
  for (const [k, v] of Object.entries(pp)) {
    if (Array.isArray(v)) console.log(`  ${k}: array[${v.length}]`, v.length ? JSON.stringify(v[0]).slice(0, 300) : '');
    else if (v && typeof v === 'object') console.log(`  ${k}: objeto {${Object.keys(v).join(', ').slice(0, 200)}}`);
    else console.log(`  ${k}: ${JSON.stringify(v)?.slice(0, 120)}`);
  }
}
