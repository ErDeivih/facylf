#!/usr/bin/env node
/**
 * Lista los grupos de una federación con más datos (para elegir una muestra de oro real).
 * Sólo lectura.
 *
 * Uso: node scripts/_diag-grupos-con-datos.mjs <federacion> [cuantos] [temporada]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const fed = process.argv[2] ?? 'castilla-leon';
const cuantos = Number(process.argv[3] ?? 12);
const soloTemporada = process.argv[4] ? Number(process.argv[4]) : null;
const carpeta = fed === 'castilla-leon' ? 'descargas-federacion' : `descargas-${fed}`;
const ruta = `${carpeta}/recolector-local/cola-v2.sqlite`;
if (!existsSync(ruta)) throw new Error(`No existe ${ruta}`);
const db = new DatabaseSync(ruta, { readOnly: true });
const filas = db.prepare(`select t.etiqueta, g.temporada, g.competicion, c.nombre competicion, g.codigo, g.nombre grupo,
    g.jornadas,
    (select count(*) from partidos p where p.temporada=g.temporada and p.competicion=g.competicion and p.grupo=g.codigo) partidos,
    (select count(*) from actas a where a.temporada=g.temporada and a.competicion=g.competicion and a.grupo=g.codigo and a.estado='hecha') actas,
    (select count(*) from participaciones pa where pa.temporada=g.temporada and pa.competicion=g.competicion and pa.grupo=g.codigo) participaciones,
    (select count(*) from eventos_acta e where e.temporada=g.temporada and e.competicion=g.competicion and e.grupo=g.codigo) eventos
  from grupos g
  join competiciones c on c.temporada=g.temporada and c.codigo=g.competicion
  join temporadas t on t.codigo=g.temporada
  ${soloTemporada === null ? '' : 'where g.temporada = ?'}
  order by actas desc, participaciones desc limit ?`).all(...(soloTemporada === null ? [cuantos] : [soloTemporada, cuantos]));
console.log(`${fed}${soloTemporada === null ? '' : ` (temporada ${soloTemporada})`}: grupos con más datos (de ${db.prepare('select count(*) n from grupos').get().n} grupos)`);
for (const f of filas) {
  console.log(`  t${f.temporada} (${f.etiqueta}) c${f.competicion} g${f.codigo} · ${String(f.competicion).slice(0, 42)} · ${f.grupo} · jornadas ${f.jornadas} · partidos ${f.partidos} · actas ${f.actas} · participaciones ${f.participaciones} · eventos ${f.eventos}`);
}
console.log('\ncomando de importación sugerido:');
const primero = filas[0];
if (primero) console.log(`  pnpm importar --federacion ${fed} --temporada ${primero.etiqueta} --grupo ${primero.codigo} --seco`);
db.close();
