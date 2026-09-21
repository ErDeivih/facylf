#!/usr/bin/env node
/**
 * SÓLO LECTURA: el marcado CRUDO de una fila de descanso, con su estructura de tablas.
 *
 * Es el instrumento de la fase de localización del defecto: enseña qué publica la fuente alrededor de la
 * palabra de descanso, en qué tabla y en qué fila vive, cuántos enlaces de equipo hay en su tabla —que es
 * el criterio con el que `extraePartidos` decide que algo es un partido— y cómo quedaría la lectura.
 *
 * Uso: npx tsx scripts/_diag-html-descanso.mjs --federacion euskadi --grupo 23233962 --jornada 2
 *      [--patron Atsedena] [--crudo 900]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const federacion = arg('federacion', 'euskadi');
const grupo = arg('grupo');
const jornada = Number(arg('jornada', 1));
const patron = arg('patron');
const crudo = Number(arg('crudo', 900));

const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const j = db.prepare(`select temporada, competicion, grupo, numero, archivo, hash from jornadas
  where grupo = ? and numero = ? limit 1`).get(grupo, jornada);
db.close();
if (!j?.archivo) { console.error(`No hay jornada ${jornada} para el grupo ${grupo} en ${federacion}`); process.exit(1); }
const ruta = [j.archivo, `${j.archivo}.gz`, j.archivo.replace(/\.gz$/, '')].find((r) => existsSync(r));
if (!ruta) { console.error(`No existe el archivo archivado: ${j.archivo}`); process.exit(1); }
const html = /\.gz$/i.test(ruta) ? gunzipSync(readFileSync(ruta)).toString('utf8') : readFileSync(ruta, 'utf8');

const palabras = patron ? [patron] : ['Descansa', 'Descans', 'Atsedena', 'Atseden', 'Reposa'];
const encontrado = palabras.find((p) => new RegExp(p, 'i').test(html));
console.log(`jornada: ${ruta}`);
console.log(`  hash en la cola: ${j.hash ?? '(null)'} · bytes: ${html.length}`);
console.log(`  palabra de descanso encontrada en el HTML: ${encontrado ? `«${encontrado}»` : 'NINGUNA'}`);
if (!encontrado) process.exit(0);

/* Marcado crudo alrededor. */
const plano = html.replace(/&nbsp;/g, ' ');
for (const m of plano.matchAll(new RegExp(encontrado, 'gi'))) {
  if (m.index === undefined) continue;
  console.log(`\n── marcado crudo (posición ${m.index}) ──`);
  console.log(plano.slice(Math.max(0, m.index - crudo), m.index + crudo));
  break;
}

/* Estructura: la fila que contiene la palabra, su tabla, y cuántos enlaces de equipo hay en esa tabla. */
console.log('\n── estructura ──');
const raizHtml = parse(html);
const filas = raizHtml.querySelectorAll('tr').filter((tr) => new RegExp(encontrado, 'i').test(tr.text));
console.log(`  filas <tr> que contienen la palabra: ${filas.length}`);
for (const [i, tr] of filas.entries()) {
  const tabla = tr.closest('table');
  const enlacesEquipo = tabla ? tabla.querySelectorAll('a[href*="NFG_VisEquipos"]').length : 0;
  const enlacesActa = tabla ? tabla.querySelectorAll('a[href*="NFG_CmpPartido"]').length : 0;
  const anidada = tabla ? tabla.querySelectorAll('table').length : 0;
  const tds = tr.querySelectorAll('td');
  console.log(`\n  fila ${i + 1}: clases="${tr.getAttribute('class') ?? ''}" celdas=${tds.length}`);
  console.log(`    texto de la fila: ${JSON.stringify(tr.text.replace(/\s+/g, ' ').trim().slice(0, 200))}`);
  console.log(`    su tabla: enlaces NFG_VisEquipos=${enlacesEquipo} (extraePartidos exige 2) · NFG_CmpPartido=${enlacesActa} · tablas anidadas=${anidada}`);
  console.log(`    ¿la fila está dentro de otra <tr>? ${tr.closest('tr') !== tr ? 'sí' : 'no'}`);
  console.log(`    celdas directas:`);
  for (const [k, td] of tds.entries()) {
    const enlaces = td.querySelectorAll('a').map((a) => `${(a.text || '').replace(/\s+/g, ' ').trim().slice(0, 30)}→${(a.getAttribute('href') ?? '').slice(0, 60)}`);
    console.log(`      td[${k}] clases="${td.getAttribute('class') ?? ''}" texto=${JSON.stringify(td.text.replace(/\s+/g, ' ').trim().slice(0, 80))}${enlaces.length ? ` · enlaces: ${enlaces.join(' | ')}` : ''}`);
  }
}
/* Y qué extrae de verdad el extractor de la cola, para esta jornada. */
console.log('\n── lo que extrae el extractor de la cola ──');
const { extraePartidos, extraePartidosWidget } = await import('./lib/recolector-local.mjs');
const clasica = extraePartidos(html);
const widget = extraePartidosWidget(html);
const esWidget = clasica.length === 0;
const usados = esWidget ? widget : clasica;
console.log(`  vía usada por el worker: ${esWidget ? 'extraePartidosWidget (nova)' : `extraePartidos (PNFG) · ${clasica.length} filas`}`);
if (esWidget) console.log(`  extraePartidosWidget devolvió ${widget.length} filas`);
for (const [i, p] of usados.entries()) {
  const sospechoso = /descans|atseden|reposa/i.test(`${p.local} ${p.visitante}`);
  console.log(`    ${sospechoso ? '⚠' : ' '} [${i}] «${p.local}» vs «${p.visitante}» · acta ${p.codActa ?? 'NULL'} · ${p.golesLocal ?? 'NULL'}-${p.golesVisitante ?? 'NULL'}`);
}
