/*
 * Cuánto tiempo está perdiendo Valencia recorriendo jornadas sin datos publicados.
 *
 * HALLAZGO DEL 26/09/2026: su ritmo de actas era de 6 por hora frente a las ~500 de las otras federaciones, y
 * no era ni la pausa ni un 503: el worker recorre una a una las jornadas de grupos cuya fuente no publica
 * partidos («la fuente no publica partidos para esta jornada»), cancelándolas de tres en tres intentos. Con
 * 8.899 grupos en su catálogo, eso puede ser días de trabajo para cero actas.
 *
 * En Castilla y León existe el atajo que aquí falta: cuando la federación lista el grupo pero no publica
 * NINGUNA jornada, se cancela el grupo entero de una vez («la federación lista el grupo pero no publica
 * jornadas para él»). Aquí se mide cuántos grupos están en ese caso.
 *
 * SÓLO LEE (y con --cancelar escribe): sin argumentos, sólo cuenta.
 */
import { DatabaseSync } from 'node:sqlite';

const CANCELAR = process.argv.includes('--cancelar');
const db = new DatabaseSync('descargas-valencia/recolector-local/cola-v2.sqlite');

const SIN_DATOS = "la fuente no publica partidos para esta jornada";

console.log('=== JORNADAS QUE YA SE CANCELARON POR NO HABER DATOS ===');
const canceladas = db.prepare(`select count(*) as n from trabajos
  where tipo='jornada' and estado='cancelado' and ultimo_error like ?`).get(SIN_DATOS + '%');
console.log(`  ${canceladas.n}`);

console.log('\n=== GRUPOS CON 3 O MÁS JORNADAS YA FALLIDAS POR ESE MOTIVO ===');
const grupos = db.prepare(`select temporada, competicion, grupo,
    count(*) as fallidas
  from trabajos
  where tipo='jornada' and ultimo_error like ? and estado in ('cancelado','pendiente')
  group by 1,2,3 having count(*) >= 3
  order by 4 desc`).all(SIN_DATOS + '%');
console.log(`  ${grupos.length} grupos afectados`);
for (const g of grupos.slice(0, 10)) {
  console.log(`    t${g.temporada} c${g.competicion} g${g.grupo}: ${g.fallidas} jornadas sin datos`);
}
if (grupos.length > 10) console.log(`    ... y ${grupos.length - 10} grupos más`);

const totalFallidas = grupos.reduce((a, g) => a + g.fallidas, 0);
console.log(`\n  jornadas implicadas en total: ${totalFallidas}`);

console.log('\n=== LO QUE QUEDA PENDIENTE EN ESOS MISMOS GRUPOS ===');
let pendientes = 0;
for (const g of grupos) {
  const fila = db.prepare(`select count(*) as n from trabajos
    where tipo='jornada' and estado='pendiente' and temporada=? and competicion=? and grupo=?`)
    .get(g.temporada, g.competicion, g.grupo);
  pendientes += fila.n;
}
console.log(`  ${pendientes} jornadas pendientes que probablemente tampoco publican nada`);

if (CANCELAR && pendientes > 0) {
  console.log('\n=== CANCELANDO (a petición) ===');
  let hechas = 0;
  for (const g of grupos) {
    const r = db.prepare(`update trabajos set estado='cancelado',
        ultimo_error='el grupo no publica ninguna jornada: se cancela el grupo entero, como en Castilla y León',
        actualizado_en=datetime('now')
      where tipo='jornada' and estado='pendiente' and temporada=? and competicion=? and grupo=?`)
      .run(g.temporada, g.competicion, g.grupo);
    hechas += Number(r.changes ?? 0);
  }
  console.log(`  ${hechas} jornadas canceladas en bloque`);
  const despues = db.prepare(`select count(*) as n from trabajos where estado='pendiente'`).get();
  console.log(`  pendientes que quedan: ${despues.n}`);
}

console.log('\n=== ESTADO DE LA COLA ===');
for (const f of db.prepare(`select estado, count(*) as n from trabajos group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(f.estado).padEnd(12)} ${f.n}`);
}
db.close();
