#!/usr/bin/env node
/** Reparto de prioridades por tipo en la cola de Cataluña, para ver qué se atiende antes. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
console.log('por tipo (prioridad mínima / máxima):');
for (const f of db.prepare(`select tipo, count(*) n, min(prioridad) pmin, max(prioridad) pmax,
  sum(estado='pendiente') pend from trabajos group by tipo order by pmin`).all()) {
  console.log(`  ${String(f.tipo).padEnd(12)} n=${String(f.n).padStart(5)} pend=${String(f.pend).padStart(5)} prioridad ${f.pmin} … ${f.pmax}`);
}
console.log('\nlos 6 trabajos pendientes que se atenderán antes:');
for (const t of db.prepare(`select tipo, temporada, competicion, grupo, jornada, acta, prioridad from trabajos
  where estado='pendiente' order by prioridad, creado_en limit 6`).all()) {
  console.log(`  ${String(t.prioridad).padStart(12)} ${t.tipo} t${t.temporada} c${t.competicion} g${t.grupo} j${t.jornada ?? '-'} ${t.acta ?? ''}`);
}
console.log('\nnombre de las competiciones implicadas:');
for (const c of db.prepare(`select distinct competicion, nombre from competiciones where competicion in
  (select competicion from trabajos where estado='pendiente' order by prioridad limit 3)`).all()) {
  console.log(`  ${c.competicion} · ${c.nombre}`);
}
db.close();
