#!/usr/bin/env node
/**
 * SÓLO LECTURA: qué TABLA acepta `extraePartidos` como partido, y por qué.
 *
 * `extraePartidos` recorre TODAS las tablas y acepta aquella que tiene exactamente dos enlaces
 * `NFG_VisEquipos`, tomando como nombres los textos de esos dos enlaces. Esta herramienta enumera las
 * tablas de una jornada archivada y enseña, para cada una, sus enlaces y si contiene una palabra de
 * descanso: es lo que permite ver si el descanso entró por una tabla que no era la de un partido.
 *
 * Uso: npx tsx scripts/_diag-tablas-extraePartidos.mjs --federacion euskadi --grupo 23233962 --jornada 2
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
const REST = /descans|atseden|reposa/i;

const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const j = db.prepare('select archivo from jornadas where grupo = ? and numero = ? limit 1').get(grupo, jornada);
db.close();
const ruta = [j.archivo, `${j.archivo}.gz`].find((r) => existsSync(r));
const html = /\.gz$/i.test(ruta) ? gunzipSync(readFileSync(ruta)).toString('utf8') : readFileSync(ruta, 'utf8');

const texto = (nodo) => String(nodo?.text ?? '').replace(/\s+/g, ' ').trim();
const raizHtml = parse(html);
const tablas = raizHtml.querySelectorAll('table');
console.log(`jornada ${ruta}`);
console.log(`tablas en el documento: ${tablas.length}`);

let aceptadas = 0;
for (const [i, tabla] of tablas.entries()) {
  const enlaces = tabla.querySelectorAll('a[href*="NFG_VisEquipos"]');
  const contieneDescanso = REST.test(tabla.text);
  const anidadas = tabla.querySelectorAll('table').length;
  if (enlaces.length !== 2) {
    // Sólo interesa si contiene descanso: es donde se puede colar algo.
    if (contieneDescanso) console.log(`\n  tabla ${i}: enlaces=${enlaces.length} (RECHAZADA) · anidadas=${anidadas} · contiene descanso`);
    continue;
  }
  aceptadas += 1;
  const t0 = texto(enlaces[0]);
  const t1 = texto(enlaces[1]);
  console.log(`\n  tabla ${i}: ACEPTADA como partido · anidadas=${anidadas} · contiene descanso=${contieneDescanso}`);
  console.log(`    enlace 0: texto=${JSON.stringify(t0)} · href=${(enlaces[0].getAttribute('href') ?? '').slice(0, 90)}`);
  console.log(`    enlace 1: texto=${JSON.stringify(t1)} · href=${(enlaces[1].getAttribute('href') ?? '').slice(0, 90)}`);
  console.log(`    → la fila emitida sería «${t0}» vs «${t1}»`);
  if (REST.test(`${t0} ${t1}`)) {
    console.log(`    ⚠ ESTA es la vía por la que el descanso entra como equipo`);
    // ¿Dónde está exactamente el enlace cuyo texto es la palabra de descanso?
    for (const [k, e] of [enlaces[0], enlaces[1]].entries()) {
      if (!REST.test(texto(e))) continue;
      console.log(`      el enlace ${k} está dentro de: <${e.parentNode?.tagName ?? '?'} class="${e.parentNode?.getAttribute?.('class') ?? ''}">`);
      console.log(`      marcado del enlace: ${e.outerHTML.slice(0, 400)}`);
    }
  }
}
console.log(`\ntablas aceptadas como partido: ${aceptadas}`);
