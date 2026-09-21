#!/usr/bin/env node
/**
 * Anatomía de una página de jornada descargada: qué desplegables trae, qué opciones tienen y qué
 * sacan nuestros extractores. Sirve para decidir si la página está vacía de verdad o si no la
 * entendemos.
 *
 * Uso: node scripts/_diag-anatomia-jornada.mjs <ruta-html[.gz]>
 */
import { leeArchivo, extraeJornadas, extraePartidos, extraeGrupos } from './lib/recolector-local.mjs';
import { parse } from 'node-html-parser';

const ruta = process.argv[2];
const html = leeArchivo(ruta)?.toString('utf8');
if (!html) throw new Error(`no se pudo leer ${ruta}`);
console.log(`${ruta} · ${html.length} caracteres`);

const raiz = parse(html);
console.log('\n-- desplegables --');
for (const s of raiz.querySelectorAll('select')) {
  const id = s.getAttribute('id') ?? '';
  const nombre = s.getAttribute('name') ?? '';
  const opciones = s.querySelectorAll('option');
  console.log(`  select id="${id}" name="${nombre}" · ${opciones.length} opciones`);
  for (const o of opciones.slice(0, 12)) {
    console.log(`      value=${o.getAttribute('value')} → «${o.text.trim().slice(0, 50)}»`);
  }
}

console.log('\n-- lo que sacan nuestros extractores --');
const jornadas = extraeJornadas(html);
console.log(`  extraeJornadas: ${jornadas.length}`, JSON.stringify(jornadas.slice(0, 5)));
console.log(`  extraeGrupos: ${extraeGrupos(html).length}`);
const partidos = extraePartidos(html);
console.log(`  extraePartidos: ${partidos.length}`);
for (const p of partidos.slice(0, 5)) {
  console.log(`      ${p.local} ${p.golesLocal ?? '-'}-${p.golesVisitante ?? '-'} ${p.visitante} (acta ${p.codActa ?? '-'})`);
}

console.log('\n-- texto visible del cuerpo (sin cabecera de cookies) --');
const visible = raiz.querySelector('body')?.text?.replace(/\s+/g, ' ').trim() ?? '';
const sinCookies = visible.replace(/^[\s\S]*?revocarse en cualquier momento[^.]*\./i, '');
console.log(sinCookies.slice(0, 1200));
