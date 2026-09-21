#!/usr/bin/env node
/** Qué respondió el servidor cuando se capturaron las actas cuyo HTML se perdió. */
import { DatabaseSync } from 'node:sqlite';

const rutaDb = process.argv[2];
const db = new DatabaseSync(rutaDb, { readOnly: true });
const falsos = db.prepare(`select codigo, temporada, competicion, grupo, jornada, archivo, incidencias
  from actas where archivo like '%.html.gz' and estado='hecha'`).all();

let sinPeticion = 0;
const tamanos = new Map();
const ejemplos = [];
for (const a of falsos) {
  const p = db.prepare(`select url, duracion_ms, resultado, detalle from peticiones
    where trabajo like ? order by id desc limit 1`).get(`acta|%|%|%|${a.jornada}|${a.codigo}`);
  if (!p) { sinPeticion++; continue; }
  const clave = `${p.resultado} · ${p.detalle ?? ''}`;
  tamanos.set(clave, (tamanos.get(clave) ?? 0) + 1);
  if (ejemplos.length < 6) ejemplos.push({ codigo: a.codigo, ...p, incidencias: a.incidencias });
}
console.log(`actas analizadas: ${falsos.length} · sin petición registrada: ${sinPeticion}`);
console.log('-- resultado registrado de la descarga --');
for (const [k, n] of [...tamanos.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${n}  ${k}`);
console.log('-- ejemplos --');
for (const e of ejemplos) console.log(`  ${e.codigo} → ${e.resultado} (${e.duracion_ms} ms) ${e.detalle}\n     ${e.url}\n     ${e.incidencias}`);
db.close();
