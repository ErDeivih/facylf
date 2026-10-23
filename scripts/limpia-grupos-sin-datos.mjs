/*
 * ── LIMPIAR EL TRABAJO QUE NO PUEDE DAR NADA, PARA CUALQUIER FEDERACIÓN ────────────────────────────────
 *
 * El caso que lo motivó: Valencia recorría una a una las jornadas de grupos que la fuente no publica
 * («la fuente no publica partidos para esta jornada») y Cataluña hacía lo mismo a lo grande — 8.848 de sus
 * 9.677 peticiones diarias acababan en «sin_publicar», y llevaba desde el 26 de septiembre sin guardar ni un
 * acta. En Castilla y León existe el atajo: cuando un grupo no publica NINGUNA jornada, se cancela el grupo
 * entero. Esto lo aplica a las colas que no lo tenían.
 *
 * Criterio, deliberadamente conservador: sólo se tocan los grupos que YA han dado el motivo de «no publica»
 * en tres o más trabajos distintos. Una jornada suelta que falle no basta: puede ser un fallo pasajero.
 *
 * NO se borra nada: se marcan como cancelados y se les deja escrito el motivo. Y el catálogo se re-sincroniza
 * cada pocos días, así que si alguno de esos grupos publica algo más adelante, vuelve a entrar solo.
 *
 * Uso:  node scripts/limpia-grupos-sin-datos.mjs <federacion> [--aplicar]
 *       (sin --aplicar sólo mide y dice lo que haría)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const COLA = {
  valencia: 'descargas-valencia/recolector-local/cola-v2.sqlite',
  madrid: 'descargas-madrid/recolector-local/cola-v2.sqlite',
  cataluna: 'descargas-cataluna/recolector-local/cola-v2.sqlite',
  'castilla-leon': 'descargas-federacion/recolector-local/cola-v2.sqlite',
};
const federacion = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
if (!federacion || !COLA[federacion]) {
  console.error(`uso: node scripts/limpia-grupos-sin-datos.mjs <${Object.keys(COLA).join('|')}> [--aplicar]`);
  process.exit(2);
}
const ruta = COLA[federacion];
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${federacion}: ${ruta}`);
  process.exit(1);
}
const db = new DatabaseSync(ruta);

console.log(`=== ${federacion.toUpperCase()} · qué se está pidiendo para nada ===`);
for (const f of db.prepare(`select substr(coalesce(ultimo_error,'(sin error)'),1,58) as motivo, count(*) as n
  from trabajos where ultimo_error is not null group by 1 order by 2 desc limit 6`).all()) {
  console.log(`  ${String(f.n).padStart(7)}  ${f.motivo}`);
}

// Los grupos que ya han demostrado no publicar: tres o más trabajos distintos con ese motivo.
const SIN_DATOS = ['la fuente no publica partidos para esta jornada', 'no publica jornadas para él', 'sin_publicar'];
const donde = SIN_DATOS.map(() => 'ultimo_error like ?').join(' or ');
const patrones = SIN_DATOS.map((x) => `%${x}%`);
const grupos = db.prepare(`select temporada, competicion, grupo, count(*) as evidencias
  from trabajos where (${donde}) and estado in ('cancelado','pendiente','hecho')
  group by 1,2,3 having count(*) >= 3 order by 4 desc`).all(...patrones);

console.log(`\n=== GRUPOS QUE NO PUBLICAN NADA (3 o más evidencias): ${grupos.length} ===`);
for (const g of grupos.slice(0, 6)) {
  console.log(`  t${g.temporada} c${g.competicion} g${g.grupo}: ${g.evidencias} trabajos`);
}
if (grupos.length > 6) console.log(`  ... y ${grupos.length - 6} grupos más`);

let pendientes = 0;
for (const g of grupos) {
  pendientes += db.prepare(`select count(*) as n from trabajos
    where estado='pendiente' and temporada=? and competicion=? and grupo=?`)
    .get(g.temporada, g.competicion, g.grupo).n;
}
const totalPend = db.prepare(`select count(*) as n from trabajos where estado='pendiente'`).get().n;
console.log(`\n  pendientes en esos grupos: ${pendientes} de ${totalPend} en total (${((100 * pendientes) / Math.max(1, totalPend)).toFixed(1)} %)`);

if (APLICAR && pendientes > 0) {
  let hechos = 0;
  for (const g of grupos) {
    const r = db.prepare(`update trabajos set estado='cancelado',
        ultimo_error='el grupo no publica ninguna jornada: se cancela el grupo entero, como en Castilla y León',
        actualizado_en=datetime('now')
      where estado='pendiente' and temporada=? and competicion=? and grupo=?`)
      .run(g.temporada, g.competicion, g.grupo);
    hechos += Number(r.changes ?? 0);
  }
  console.log(`\n=== APLICADO: ${hechos} trabajos cancelados ===`);
  console.log(`  pendientes que quedan: ${db.prepare(`select count(*) as n from trabajos where estado='pendiente'`).get().n}`);
} else if (!APLICAR) {
  console.log('\n(medición: no se ha cambiado nada. Con --aplicar se hace.)');
}

console.log('\n=== ESTADO DE LA COLA ===');
for (const f of db.prepare(`select estado, count(*) as n from trabajos group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(f.estado).padEnd(12)} ${f.n}`);
}
db.close();
