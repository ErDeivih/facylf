/*
 * ── ¿SE ESTÁN GUARDANDO LOS APLAZAMIENTOS DE CATALUÑA? ──────────────────────────────────────────────────
 *
 * Diagnóstico del 02/10/2026: la cola de Cataluña tiene 2.020 trabajos de ACTA disponibles en la temporada en
 * curso y 1.157 en la anterior, pero el recolector se pasa el día visitando `clasificacion` y `calendario` de
 * grupos cuyo calendario aún no está publicado. El registro enseña los MISMOS grupos una y otra vez
 * (58163052, 58163053, … 58163063 y vuelta a empezar), y cada uno dice «se vuelve a mirar el 1 de abril».
 *
 * Si el aplazamiento se guardara, esos grupos no podrían repetirse. Así que la pregunta es concreta: ¿a qué hora
 * está citado cada trabajo, y cuántos están citados AHORA MISMO? Se contesta mirando `siguiente_intento` por
 * tramos, que es lo que hace esto.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/diagnostica-cataluna.mjs <cola.sqlite> [competicion]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, competicion] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) {
  console.error('uso: node scripts/diagnostica-cataluna.mjs <cola.sqlite> [competicion]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true });
const ahora = new Date().toISOString();

console.log('\n=== ¿CUÁNDO ESTÁ CITADO CADA TRABAJO PENDIENTE? ===');
const tramos = db.prepare(`
  select case
      when siguiente_intento is null then 'sin cita (elegible ya)'
      when siguiente_intento <= ? then 'vencido (elegible ya)'
      when siguiente_intento < ? then 'hoy o mañana'
      when siguiente_intento < ? then 'esta semana'
      when siguiente_intento < ? then 'este mes'
      else 'más adelante (p. ej. 1 de abril)'
    end as tramo, tipo, count(*) n
  from trabajos
  where estado in ('pendiente','bloqueado')
  group by tramo, tipo order by 1, 3 desc`,
).all(ahora, new Date(Date.now() + 864e5).toISOString(), new Date(Date.now() + 7 * 864e5).toISOString(),
  new Date(Date.now() + 30 * 864e5).toISOString());
let elegibles = 0;
for (const t of tramos) {
  if (t.tramo.startsWith('sin cita') || t.tramo.startsWith('vencido')) elegibles += t.n;
  console.log(`  ${String(t.tramo).padEnd(30)} ${String(t.tipo).padEnd(18)} ${t.n}`);
}
console.log(`\n  ELEGIBLES AHORA MISMO: ${elegibles}`);

console.log('\n=== ¿TIENE LA COLUMNA DE LA RACHA Y CÓMO ESTÁ REPARTIDA? ===');
const cols = db.prepare('pragma table_info(trabajos)').all().map((c) => c.name);
if (!cols.includes('sin_publicar_seguidos')) {
  console.log('  *** NO EXISTE la columna `sin_publicar_seguidos`: el aplazamiento creciente no se está contando ***');
} else {
  for (const r of db.prepare(`select sin_publicar_seguidos racha, count(*) n from trabajos
    where estado in ('pendiente','bloqueado') group by 1 order by 1`).all()) {
    console.log(`  racha ${String(r.racha).padStart(3)} → ${r.n} trabajos`);
  }
}

if (competicion) {
  console.log(`\n=== LOS TRABAJOS DE LA COMPETICIÓN ${competicion} (los que se repiten en el registro) ===`);
  const filas = db.prepare(`select tipo, grupo, jornada, estado, intentos,
      coalesce(sin_publicar_seguidos,-1) racha, siguiente_intento, substr(coalesce(ultimo_error,''),1,60) err
    from trabajos where competicion = ? order by tipo, grupo limit 25`).all(String(competicion));
  for (const f of filas) {
    console.log(`  ${String(f.tipo).padEnd(14)} g${String(f.grupo).padEnd(9)} j${String(f.jornada ?? '-').padEnd(3)} ` +
      `${String(f.estado).padEnd(10)} int${String(f.intentos).padStart(3)} racha${String(f.racha).padStart(3)} ` +
      `${String(f.siguiente_intento ?? '-').slice(0, 19)}  ${f.err}`);
  }
  const actas = db.prepare(`select count(*) n from trabajos where competicion = ? and tipo = 'acta'
    and estado in ('pendiente','bloqueado')`).get(String(competicion)).n;
  console.log(`\n  actas pendientes en esa competición: ${actas}`);
}
db.close();
