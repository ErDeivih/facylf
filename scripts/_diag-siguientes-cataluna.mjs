#!/usr/bin/env node
/** Los trabajos que se atenderán antes, con el nombre de su competición. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
console.log('pendientes por tipo (sólo pendientes):');
for (const f of db.prepare(`select tipo, count(*) n, min(prioridad) pmin, max(prioridad) pmax from trabajos
  where estado='pendiente' group by tipo order by pmin`).all()) {
  console.log(`  ${f.tipo.padEnd(12)} n=${String(f.n).padStart(5)} prioridad ${f.pmin} … ${f.pmax}`);
}
console.log('\nlos 10 siguientes:');
for (const t of db.prepare(`select t.tipo, t.temporada, t.competicion, t.grupo, t.jornada, t.prioridad,
  (select nombre from competiciones c where c.temporada=t.temporada and c.codigo=t.competicion) nombre
  from trabajos t where t.estado='pendiente' order by t.prioridad, t.creado_en limit 10`).all()) {
  console.log(`  ${String(t.prioridad).padStart(12)} ${t.tipo.padEnd(12)} t${t.temporada} ${String(t.nombre).slice(0, 42)}`);
}
db.close();
