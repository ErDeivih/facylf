#!/usr/bin/env node
/** Muestras de incidencias que necesitan contrastarse con el HTML original. Sólo lectura. */
import { DatabaseSync } from 'node:sqlite';

const ruta = process.argv[2];
if (!ruta) throw new Error('Uso: node scripts/_diag-muestras-calidad.mjs <cola-v2.sqlite>');
const db = new DatabaseSync(ruta, { readOnly: true });

const marcadores = db.prepare(`select a.codigo,a.temporada,a.competicion,a.grupo,a.jornada,a.archivo,
    a.incidencias,p.local,p.visitante,p.goles_local,p.goles_visitante,
    json_extract(a.datos,'$.golesLocal') goles_acta_local,
    json_extract(a.datos,'$.golesVisitante') goles_acta_visitante,
    json_array_length(json_extract(a.datos,'$.goles')) eventos_gol
  from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
    and p.grupo=a.grupo and p.jornada=a.jornada and p.codigo_acta=a.codigo
  where a.estado='hecha' and p.goles_local is not null and
    (cast(json_extract(a.datos,'$.golesLocal') as integer)<>p.goles_local or
     cast(json_extract(a.datos,'$.golesVisitante') as integer)<>p.goles_visitante)
  order by a.temporada desc,a.jornada desc limit 15`).all();
console.log('MARCADORES DISTINTOS');
console.log(JSON.stringify(marcadores, null, 2));

const sinAlineaciones = db.prepare(`select a.codigo,a.temporada,a.competicion,a.grupo,a.jornada,
    a.archivo,a.incidencias,p.local,p.visitante,p.goles_local,p.goles_visitante,
    json_extract(a.datos,'$.golesLocal') goles_acta_local,
    json_extract(a.datos,'$.golesVisitante') goles_acta_visitante
  from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
    and p.grupo=a.grupo and p.jornada=a.jornada and p.codigo_acta=a.codigo
  where a.estado='hecha' and a.incidencias like '%sin_alineaciones%'
  order by a.temporada desc,a.jornada desc limit 15`).all();
console.log('\nSIN ALINEACIONES');
console.log(JSON.stringify(sinAlineaciones, null, 2));
db.close();
