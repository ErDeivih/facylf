#!/usr/bin/env node
/**
 * Exporta, por jornada de una cola PNFG, sólo CIFRAS: clave, fecha, si se leyó, partidos, actas hechas / sin datos /
 * pendientes. Para cruzar las colas del PC y del servidor de una misma federación (CyL tiene temporadas en las dos).
 * Salida: TSV comprimido en gzip y en base64 entre las marcas «BEGIN»/«END». Sólo lectura.
 *   node scripts/claude/exporta-jornadas.mjs <cola-v2.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { gzipSync } from 'node:zlib';
const ruta = process.argv[2];
let db;
// Primero normal (ve el WAL); si el sistema de ficheros no deja (la carpeta montada en la VM), foto inmutable.
try { db = new DatabaseSync(ruta, { readOnly: true }); db.prepare('select count(*) from actas').get(); }
catch { db = new DatabaseSync(`file:${ruta.replace(/\\/g, '/')}?immutable=1`, { readOnly: true }); }
const et = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((r) => [String(r.codigo), r.etiqueta]));
const part = new Map(db.prepare(`select temporada||'|'||competicion||'|'||grupo||'|'||jornada k, count(*) n from partidos group by 1`).all().map((r) => [r.k, r.n]));
const act = new Map();
for (const r of db.prepare(`select temporada||'|'||competicion||'|'||grupo||'|'||jornada k, estado, count(*) n from actas group by 1, 2`).all()) {
  const x = act.get(r.k) ?? { hecha: 0, sin_datos: 0, pendiente: 0 }; x[r.estado] = (x[r.estado] ?? 0) + r.n; act.set(r.k, x);
}
const lineas = [];
for (const j of db.prepare('select temporada, competicion, grupo, numero, fecha, comprobada_en from jornadas').all()) {
  const k = `${j.temporada}|${j.competicion}|${j.grupo}|${j.numero}`;
  const a = act.get(k) ?? { hecha: 0, sin_datos: 0, pendiente: 0 };
  lineas.push([et.get(String(j.temporada)) ?? j.temporada, j.competicion, j.grupo, j.numero, String(j.fecha ?? '').slice(0, 10),
    j.comprobada_en ? 1 : 0, part.get(k) ?? 0, a.hecha ?? 0, a.sin_datos ?? 0, a.pendiente ?? 0].join('\t'));
}
console.log(`filas ${lineas.length}`);
console.log('BEGIN');
console.log(gzipSync(Buffer.from(lineas.join('\n'))).toString('base64').replace(/(.{120})/g, '$1\n'));
console.log('END');
