#!/usr/bin/env node
/** Estado real de las actas cuyo archivo es un `.gz` falso: qué hay en `datos` y en el fichero. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const rutaDb = process.argv[2];
const limite = Number(process.argv[3] ?? 8);
const db = new DatabaseSync(rutaDb, { readOnly: true });

const filas = db.prepare(`select codigo, temporada, competicion, grupo, jornada, estado, archivo,
    version_parser, calidad, incidencias, length(datos) largo_datos,
    json_extract(datos,'$.golesLocal') gl, json_extract(datos,'$.golesVisitante') gv,
    json_array_length(json_extract(datos,'$.goles')) goles,
    json_array_length(json_extract(datos,'$.lineups.local.titulares')) tl,
    json_array_length(json_extract(datos,'$.tecnicos')) tec
  from actas where archivo like '%.html.gz' and archivo is not null order by temporada desc, jornada desc`).all();

let vacias = 0;
let conDatos = 0;
for (const f of filas) {
  if (!existsSync(f.archivo)) continue;
  let esGz = false;
  try { esGz = readFileSync(f.archivo).subarray(0, 2).toString('hex') === '1f8b'; } catch { /* nada */ }
  if (esGz) continue;
  const util = (f.goles ?? 0) > 0 || (f.tl ?? 0) > 0 || (f.tec ?? 0) > 0;
  if (util) conDatos++; else vacias++;
}
console.log(`actas con .html.gz falso: ${filas.length} · con datos aprovechables en la base: ${conDatos} · con datos vacíos: ${vacias}`);

console.log('\nmuestra:');
for (const f of filas.slice(0, limite)) {
  const tam = existsSync(f.archivo) ? statSync(f.archivo).size : -1;
  let contenido = '';
  try {
    const b = readFileSync(f.archivo);
    contenido = b.subarray(0, 2).toString('hex') === '1f8b' ? 'GZIP' : `JSON ${b.length} B`;
  } catch { contenido = 'ilegible'; }
  console.log(`  ${f.codigo} t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} · ${f.estado} v${f.version_parser} · datos=${f.largo_datos} B (gl=${f.gl} gv=${f.gv} goles=${f.goles} tit=${f.tl} tec=${f.tec})`);
  console.log(`     fichero ${tam} B → ${contenido} · calidad=${f.calidad} · ${f.incidencias}`);
}
db.close();
