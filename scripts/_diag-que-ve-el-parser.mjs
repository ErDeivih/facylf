#!/usr/bin/env node
/** Comprueba qué ve el analizador en el HTML archivado de un acta concreta. */
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo, inspeccionaActa } from './lib/recolector-local.mjs';
import { parse } from 'node-html-parser';

const [fed, codigo] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const a = db.prepare('select archivo, incidencias, estado from actas where codigo=?').get(codigo);
db.close();
console.log('acta:', a);
const bruto = leeArchivo(a.archivo);
console.log('leeArchivo devolvió', bruto ? `${bruto.length} bytes` : 'null');
const html = bruto?.toString('utf8') ?? '';
console.log('ocurrencias de "jugador=":', html.split('jugador=').length - 1);
console.log('inspeccionaActa:', JSON.stringify(inspeccionaActa(html)));
const raiz = parse(html);
for (const sel of ['tr[onclick*="jugador="]', 'tr[onclick]', 'tr', 'table']) {
  console.log(`  selector ${sel}: ${raiz.querySelectorAll(sel).length}`);
}
const primera = raiz.querySelectorAll('tr[onclick]')[0];
if (primera) console.log('  primer tr[onclick]:', (primera.getAttribute('onclick') ?? '').slice(0, 160));
