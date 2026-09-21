#!/usr/bin/env node
/** Trae UNA ficha de acta de rffm.es y describe su estructura, para diseñar el parser. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'FacylfBot/1.0 (proyecto personal; contacto: nanotech@gmail.com)';
const codacta = process.argv[2] ?? '1562659';
const url = `https://www.rffm.es/acta-partido/${codacta}`;
const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
const html = await r.text();
const carpeta = join(import.meta.dirname, '..', 'descargas-madrid', 'recolector-local', '_muestras');
mkdirSync(carpeta, { recursive: true });
const archivo = join(carpeta, `acta-${codacta}.html`);
writeFileSync(archivo, html);
console.log(`${url} → ${r.status} ${r.headers.get('content-type')} ${Buffer.byteLength(html)} B`);
console.log(`guardado en ${archivo}`);

const texto = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
console.log(`\ntexto visible (${texto.length} caracteres):\n${texto.slice(0, 2500)}`);

for (const pista of ['__NEXT_DATA__', 'Alineacion', 'Alineación', 'Titulares', 'Suplentes', 'Goles', 'Tarjeta', 'Arbitro', 'Árbitro', 'Cuerpo Tecnico', 'Cuerpo Técnico', 'titular', 'jugador']) {
  const n = html.split(pista).length - 1;
  if (n) console.log(`  «${pista}»: ${n}`);
}
const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
if (nd) {
  console.log(`\n__NEXT_DATA__: ${nd[1].length} B`);
  try {
    const datos = JSON.parse(nd[1]);
    const claves = (o, prefijo = '', nivel = 0) => {
      if (!o || typeof o !== 'object' || nivel > 3) return;
      for (const [k, v] of Object.entries(o)) {
        console.log(`${'  '.repeat(nivel + 1)}${prefijo}${k}${Array.isArray(v) ? ` [${v.length}]` : typeof v === 'object' && v ? '' : ` = ${String(v).slice(0, 60)}`}`);
        claves(v, '', nivel + 1);
      }
    };
    claves(datos.props?.pageProps ?? datos.props);
  } catch (error) { console.log('  no se pudo analizar:', error.message); }
}
