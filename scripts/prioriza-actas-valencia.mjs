/*
 * VALENCIA: poner las ACTAS por delante de los ÍNDICES.
 *
 * EL PROBLEMA, medido el 27/09/2026: la prioridad más alta de su cola la tienen los `indice_jornadas`
 * (150.891.100) y las actas están por debajo (150.782.100). El recolector atiende primero lo que más prioridad
 * tiene, así que se pasa el rato descubriendo trabajo (1.157 índices en una hora, que NO son datos) mientras
 * tiene **8.913 actas ya descubiertas** esperando. Resultado: 38-46 actas por hora donde Madrid, con el mismo
 * proveedor, hace 285.
 *
 * EL ARREGLO, sin tocar código: subir la prioridad de los trabajos de tipo `acta` que ya están en la cola por
 * encima del índice más alto que tenga la suya. Es un reordenamiento de trabajo, no un cambio de ritmo ni de
 * peticiones: no aumenta lo que se le pide a la federación, sólo cambia el orden en que se pide.
 *
 * Uso:  node scripts/prioriza-actas-valencia.mjs            (mide y dice lo que haría)
 *       node scripts/prioriza-actas-valencia.mjs --aplicar  (lo hace)
 */
import { DatabaseSync } from 'node:sqlite';
const APLICAR = process.argv.includes('--aplicar');
const db = new DatabaseSync('descargas-valencia/recolector-local/cola-v2.sqlite');

const idx = db.prepare(`select max(prioridad) as p from trabajos where tipo='indice_jornadas' and estado='pendiente'`).get();
const acta = db.prepare(`select min(prioridad) as pmin, max(prioridad) as pmax, count(*) as n
  from trabajos where tipo='acta' and estado='pendiente'`).get();

console.log('=== ANTES ===');
console.log(`  indice_jornadas pendientes: prioridad máxima ${idx.p}`);
console.log(`  acta pendientes:            ${acta.n} · prioridad ${acta.pmin} .. ${acta.pmax}`);

const nueva = Number(idx.p ?? 0) + 1000;
console.log(`\n  se pondrían las actas en prioridad ${nueva} (por encima de los índices)`);

if (!APLICAR) {
  console.log('\n(medición: no se ha cambiado nada. Con --aplicar se hace.)');
  db.close();
  process.exit(0);
}

const r = db.prepare(`update trabajos set prioridad = ? where tipo='acta' and estado='pendiente'`).run(nueva);
console.log(`\n=== APLICADO: ${r.changes} actas reordenadas ===`);

console.log('\n=== DESPUÉS: los 3 primeros trabajos que cogerá ===');
for (const t of db.prepare(`select tipo, clave, prioridad from trabajos
  where estado='pendiente' order by prioridad desc limit 3`).all()) {
  console.log(`  ${String(t.tipo).padEnd(18)} prioridad ${t.prioridad}  ${t.clave}`);
}
console.log('\n=== Y los pendientes por tipo, con su prioridad máxima ===');
for (const f of db.prepare(`select tipo, count(*) as n, max(prioridad) as pmax from trabajos
  where estado='pendiente' group by 1 order by pmax desc`).all()) {
  console.log(`  ${String(f.tipo).padEnd(18)} ${String(f.n).padStart(6)} pendientes · prioridad máx ${f.pmax}`);
}
db.close();
