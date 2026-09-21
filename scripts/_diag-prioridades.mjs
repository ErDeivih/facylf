#!/usr/bin/env node
/**
 * Reparto de prioridades de una cola: sirve para ver si la federación tiene categorías diferenciadas
 * o si todo cae en el mismo cajón (en ese caso primero va TODA la estructura y luego las actas).
 */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const federacion = process.argv[2] ?? 'baleares';
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), dir, 'recolector-local',
  'cola-v2.sqlite'), { readOnly: true });
const filas = db.prepare(`select t.tipo, c.nombre competicion, count(*) n, min(t.prioridad) p
  from trabajos t left join competiciones c on c.temporada=t.temporada and c.codigo=t.competicion
  where t.estado='pendiente' group by t.tipo, c.nombre order by p limit 12`).all();
console.log(`${federacion}: trabajos pendientes por competición y tipo (los 12 primeros por prioridad):`);
for (const f of filas) {
  console.log(`  ${String(f.p).padStart(12)} ${String(f.tipo).padEnd(16)} ${String(f.competicion ?? '').slice(0, 44).padEnd(46)} ${f.n}`);
}
const porBase = db.prepare(`select substr(cast(prioridad / 1000000 as int), 1, 3) base, tipo, count(*) n
  from trabajos where estado='pendiente' group by base, tipo order by n desc limit 10`).all();
console.log('\npor categoría (millones de la prioridad) y tipo:');
for (const b of porBase) console.log(`  base ${String(b.base).padStart(3)} · ${String(b.tipo).padEnd(16)} ${b.n}`);
db.close();
