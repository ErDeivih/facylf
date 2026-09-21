#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿cuadra «(P) = ganador del partido en penaltis» con los marcadores de esas filas?
 *
 * Un partido decidido en penaltis llega a la tanda con el marcador EMPATADO (o con prórroga), así que si
 * `(P)` significa eso, sus filas deberían tener los dos goles iguales mucho más a menudo que el resto. Es
 * la comprobación que convierte «el `title` lo dice» en «el `title` lo dice Y los datos concuerdan».
 *
 * Uso: npx tsx scripts/_diag-penaltis-concordancia.mjs [--federacion euskadi] [--raiz <raiz>]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const conP = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, local, visitante,
    goles_local gl, goles_visitante gv from partidos
  where local like '%(P)%' or visitante like '%(P)%' order by temporada, competicion, grupo, jornada, orden`).all();
const sinP = db.prepare(`select count(*) n from partidos
  where (local not like '%(P)%' and visitante not like '%(P)%')
    and goles_local is not null and goles_visitante is not null`).get().n;
const empatesSinP = db.prepare(`select count(*) n from partidos
  where (local not like '%(P)%' and visitante not like '%(P)%')
    and goles_local is not null and goles_visitante = goles_local`).get().n;

let conMarcador = 0;
let empatados = 0;
for (const f of conP) {
  if (f.gl === null || f.gv === null) continue;
  conMarcador += 1;
  if (f.gl === f.gv) empatados += 1;
}
console.log(`filas con «(P)»: ${conP.length} · con marcador publicado: ${conMarcador} · con los dos goles IGUALES: ${empatados}`);
console.log(`resto de la cola con marcador: ${sinP} · empatadas: ${empatesSinP} (${(100 * empatesSinP / sinP).toFixed(1)} %)`);
if (conMarcador) console.log(`filas con «(P)» empatadas: ${(100 * empatados / conMarcador).toFixed(1)} %`);

// El marcador de penaltis que publica la ficha ("Zigorrak") y el marcador del partido, en la misma fila.
const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};
console.log('\nmuestras: marcador de la fila contra el marcador de penaltis del HTML');
let vistas = 0;
for (const f of conP) {
  if (f.gl === null || f.gv === null) continue;
  const j = db.prepare('select archivo from jornadas where temporada=? and competicion=? and grupo=? and numero=?')
    .get(f.temporada, f.competicion, f.grupo, f.jornada);
  const html = j?.archivo ? leer(j.archivo) : null;
  if (html === null) continue;
  const conparentesis = /\(P\)/i.test(f.local) ? f.local : f.visitante;
  const palabra = conparentesis.replace(/\([^)]*\)/g, ' ').split(/[\s,."]+/).filter((p) => p.length > 4)[0] ?? '';
  const i = palabra ? html.toUpperCase().indexOf(palabra.toUpperCase()) : -1;
  if (i < 0) continue;
  const trozo = html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(Math.max(0, i - 900), i + 60);
  const zigorrak = /Zigorrak?:\s*<\/strong>\s*([0-9]+)\s*-\s*([0-9]+)/i.exec(trozo);
  console.log(`  t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} · fila ${f.gl}-${f.gv}`
    + `${zigorrak ? ` · penaltis ${zigorrak[1]}-${zigorrak[2]}` : ' · (no se localizó «Zigorrak»)'}`
    + ` · «${conparentesis}»`);
  vistas += 1;
  if (vistas >= 8) break;
}
db.close();
