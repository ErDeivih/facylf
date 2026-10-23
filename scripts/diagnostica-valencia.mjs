/*
 * ¿Por qué Valencia no produce actas si le quedan 7.000 por hacer?
 *
 * Los dos seguimientos dicen que no avanza (6 actas y luego 0), y que los pendientes SUBEN. La cancelación de
 * jornadas vacías no lo arregló, así que la pregunta es qué trabajos está cogiendo y en qué orden.
 */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('descargas-valencia/recolector-local/cola-v2.sqlite', { readOnly: true });

console.log('=== PENDIENTES POR TIPO (qué trabajo le queda de verdad) ===');
for (const f of db.prepare(`select tipo, count(*) as n,
    sum(case when siguiente_intento is null or siguiente_intento <= datetime('now') then 1 else 0 end) as listos
  from trabajos where estado='pendiente' group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(f.tipo).padEnd(18)} ${String(f.n).padStart(7)} pendientes · ${String(f.listos).padStart(7)} listos ahora`);
}

console.log('\n=== ¿COGE ANTES LOS QUE FALLAN? prioridad de cada tipo ===');
for (const f of db.prepare(`select tipo, min(prioridad) as prio_min, max(prioridad) as prio_max, count(*) as n
  from trabajos where estado='pendiente' group by 1 order by prio_min desc`).all()) {
  console.log(`  ${String(f.tipo).padEnd(18)} prioridad ${f.prio_min} .. ${f.prio_max} (${f.n} trabajos)`);
}

console.log('\n=== LO QUE HA TOCADO EN LA ÚLTIMA HORA ===');
for (const f of db.prepare(`select tipo, estado, count(*) as n from trabajos
  where actualizado_en > datetime('now','-1 hour') group by 1,2 order by 3 desc limit 10`).all()) {
  console.log(`  ${String(f.tipo).padEnd(18)} ${String(f.estado).padEnd(12)} ${f.n}`);
}

console.log('\n=== LOS ÚLTIMOS 6 TRABAJOS TOCADOS, CON SU MOTIVO ===');
for (const t of db.prepare(`select tipo, estado, intentos, actualizado_en, substr(clave,1,42) as clave,
    substr(coalesce(ultimo_error,'(sin error)'),1,70) as err
  from trabajos order by actualizado_en desc limit 6`).all()) {
  console.log(`  ${t.actualizado_en} ${t.tipo}/${t.estado} int=${t.intentos} ${t.clave}`);
  console.log(`      ${t.err}`);
}

console.log('\n=== ACTAS PENDIENTES: ¿TIENEN SUS JORNADAS Y CALENDARIOS? ===');
const actasPend = db.prepare(`select count(*) as n from trabajos where tipo='acta' and estado='pendiente'`).get();
const actasListas = db.prepare(`select count(*) as n from trabajos where tipo='acta' and estado='pendiente'
  and (siguiente_intento is null or siguiente_intento <= datetime('now'))`).get();
console.log(`  actas pendientes: ${actasPend.n} · listas ahora: ${actasListas.n}`);
if (actasListas.n > 0) {
  console.log('  las 3 primeras actas listas:');
  for (const t of db.prepare(`select clave, prioridad from trabajos where tipo='acta' and estado='pendiente'
    and (siguiente_intento is null or siguiente_intento <= datetime('now')) order by prioridad desc limit 3`).all()) {
    console.log(`    ${t.clave} (prioridad ${t.prioridad})`);
  }
}
db.close();
