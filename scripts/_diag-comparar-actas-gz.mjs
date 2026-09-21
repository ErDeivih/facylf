#!/usr/bin/env node
/** Compara dentro del mismo grupo las actas con HTML intacto y las que tienen el `.gz` falso. */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';

const rutaDb = process.argv[2];
const db = new DatabaseSync(rutaDb, { readOnly: true });
const esGz = (ruta) => {
  if (!existsSync(ruta)) return null;
  try { const b = readFileSync(ruta).subarray(0, 2); return b[0] === 0x1f && b[1] === 0x8b; } catch { return null; }
};

const grupos = db.prepare(`select distinct temporada, competicion, grupo from actas where archivo like '%.html.gz'`).all();
let intocadas = 0; let falsas = 0;
const muestra = [];
for (const g of grupos) {
  const filas = db.prepare(`select codigo,jornada,estado,incidencias,archivo,length(datos) largo,
      json_array_length(json_extract(datos,'$.goles')) goles,
      json_array_length(json_extract(datos,'$.lineups.local.titulares')) tl,
      json_array_length(json_extract(datos,'$.tecnicos')) tec,
      (select count(*) from participaciones p where p.temporada=actas.temporada and p.competicion=actas.competicion
        and p.grupo=actas.grupo and p.jornada=actas.jornada and p.acta=actas.codigo) parts
    from actas where temporada=? and competicion=? and grupo=?`).all(g.temporada, g.competicion, g.grupo);
  for (const f of filas) {
    const gz = esGz(f.archivo);
    if (gz === false) { falsas++; if (muestra.length < 14) muestra.push({ ...f, clase: 'FALSA' }); }
    else if (gz === true) { intocadas++; if (muestra.filter((m) => m.clase === 'INTACTA').length < 14 && f.parts > 0) muestra.push({ ...f, clase: 'INTACTA' }); }
  }
}
console.log(`actas con .html.gz: ${intocadas + falsas} · intactas ${intocadas} · con JSON dentro ${falsas}`);
console.log('\nclase   acta        J   datos  goles tit tec  parts  incidencias');
for (const m of muestra) {
  console.log(`${m.clase.padEnd(7)} ${m.codigo.padEnd(11)} ${String(m.jornada).padStart(3)} ${String(m.largo).padStart(6)} ${String(m.goles ?? '-').padStart(6)} ${String(m.tl ?? '-').padStart(3)} ${String(m.tec ?? '-').padStart(3)} ${String(m.parts).padStart(6)}  ${m.incidencias}`);
}
db.close();
