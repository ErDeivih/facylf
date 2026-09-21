#!/usr/bin/env node
/**
 * SÓLO LECTURA: volcado CRUDO de filas de partido de la maqueta «nova» de Euskadi.
 *
 * Enseña el HTML completo de cada fila de partido —atributos incluidos— para poder documentar dónde
 * aparece (o no) un identificador de equipo. Se eligen filas con dos códigos, con uno y con ninguno,
 * y se busca en TODA la fila cualquier patrón de identificador.
 *
 * Uso: node scripts/_diag-nova-fila-cruda.mjs [nFilas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';

const nFilas = Number(process.argv[2] ?? 3);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

/** Una jornada de cada clase: con códigos, sin códigos, y de una temporada antigua y una reciente. */
const casos = db.prepare(`select j.temporada, j.competicion, j.grupo, j.numero, j.archivo,
    (select count(*) from partidos p where p.temporada=j.temporada and p.competicion=j.competicion and p.grupo=j.grupo and p.jornada=j.numero) partidos,
    (select count(*) from partidos p where p.temporada=j.temporada and p.competicion=j.competicion and p.grupo=j.grupo and p.jornada=j.numero and p.equipo_local_codigo is not null) conLocal
  from jornadas j where j.archivo is not null and j.numero = 1
  order by j.temporada desc, conLocal desc`).all();

const elegidas = [];
for (const clase of ['reciente-con-codigos', 'reciente-sin-codigos', 'antigua-sin-codigos']) {
  const [temporadaMin, temporadaMax] = clase === 'antigua-sin-codigos' ? ['0', '15'] : ['20', '99'];
  const quiereCodigos = clase === 'reciente-con-codigos';
  const encontrada = casos.find((c) => c.temporada >= temporadaMin && c.temporada <= temporadaMax
    && (quiereCodigos ? c.conLocal > 0 : c.conLocal === 0) && !elegidas.includes(c));
  if (encontrada) elegidas.push(encontrada);
}

for (const j of elegidas) {
  const html = leer(j.archivo);
  if (!html) { console.log(`\n### t${j.temporada} c${j.competicion} g${j.grupo}: no se pudo leer ${j.archivo}`); continue; }
  const raizHtml = parse(html);
  const conL = raizHtml.querySelectorAll('.font_widgetL');
  const conV = raizHtml.querySelectorAll('.font_widgetV');
  console.log(`\n################ t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero} ################`);
  console.log(`  ${html.length} caracteres · .font_widgetL ${conL.length} · .font_widgetV ${conV.length} · partidos en la cola ${j.partidos} (con código local ${j.conLocal})`);

  // Fila más interna que contiene los dos nombres, igual que hace el extractor.
  const candidatas = raizHtml.querySelectorAll('tr').filter((tr) => tr.querySelector('.font_widgetL') && tr.querySelector('.font_widgetV'));
  const filas = candidatas.filter((tr) => !candidatas.some((otra) => otra !== tr && tr.querySelectorAll('tr').includes(otra)));
  console.log(`  filas de partido (las más internas): ${filas.length}`);
  for (const [i, fila] of filas.slice(0, nFilas).entries()) {
    const crudo = fila.outerHTML.replace(/\s+/g, ' ');
    console.log(`\n  --- fila ${i} (${crudo.length} caracteres) ---`);
    console.log(`  ${crudo.slice(0, 2600)}`);
    // Todos los identificadores que aparezcan en la fila.
    const patrones = [['equipo1=', /equipo1=[^&"']*/gi], ['equipo2=', /equipo2=[^&"']*/gi], ['Codigo_Equipo', /Codigo_Equipo=[^&"']*/gi],
      ['codequipo', /codequipo[="][^&"']*/gi], ['CodActa', /CodActa=[^&"']*/gi], ['href=', /href="([^"]{0,120})"/gi],
      ['onclick', /onclick="([^"]{0,120})"/gi], ['data-', /\sdata-[a-z-]+="[^"]{0,60}"/gi]];
    for (const [nombre, re] of patrones) {
      const m = [...crudo.matchAll(re)].map((x) => x[0]).slice(0, 6);
      if (m.length) console.log(`      ${nombre}: ${JSON.stringify(m)}`);
    }
  }
  // ¿Y en el resto de la página? ¿Hay algún listado con pares código/nombre?
  for (const [nombre, re] of [['equipo1/2 fuera de filas', /equipo[12]=/gi], ['Codigo_Equipo= en toda la página', /Codigo_Equipo=/gi],
    ['codequipo en toda la página', /codequipo/gi], ['codEquipo', /codEquipo/gi]]) {
    console.log(`  ${nombre}: ${(html.match(re) ?? []).length}`);
  }
}
db.close();
