/*
 * VALENCIA: quitar del medio los ÍNDICES de grupos que no publican nada.
 *
 * LO QUE SE DESCUBRIÓ EL 27/09/2026, y que cambia el diagnóstico: la prioridad de Valencia NO está mal. Su
 * fórmula es explícita —fase 1 = descubrimiento (catálogo, grupos, ÍNDICES DE JORNADAS, calendario,
 * clasificación) y fase 2 = datos (jornadas y ACTAS)— y el recolector atiende la fase 1 antes que la 2 **a
 * propósito**, para saber cuántas actas existen antes de bajarlas. Por eso hace 46 actas/hora y Madrid 285:
 * Madrid ya tiene el descubrimiento hecho.
 *
 * Consecuencia práctica: tocar la prioridad a mano no sirve de nada (hay un `repriorizaPlan()` que la recalcula
 * en cada sesión) y forzar las actas por delante del descubrimiento rompería la coherencia con el visor.
 *
 * LO QUE SÍ SE PUEDE HACER, y es lo que hace este guion: el descubrimiento que está por delante son 7.258
 * índices de jornadas pendientes, y una parte son de GRUPOS QUE NO PUBLICAN NINGUNA JORNADA (los que ya han
 * dado «la federación lista el grupo pero no publica jornadas para él»). Esos no van a descubrir nada nunca:
 * se cancelan en bloque y el recolector llega antes a los que sí tienen datos.
 *
 * Uso:  node scripts/limpia-indices-valencia.mjs            (sólo mide)
 *       node scripts/limpia-indices-valencia.mjs --aplicar  (cancela)
 */
import { DatabaseSync } from 'node:sqlite';
const APLICAR = process.argv.includes('--aplicar');
const db = new DatabaseSync('descargas-valencia/recolector-local/cola-v2.sqlite');

const SIN_JORNADAS = 'la federación lista el grupo pero no publica jornadas';

console.log('=== ÍNDICES DE JORNADAS PENDIENTES ===');
console.log(`  total: ${db.prepare(`select count(*) as n from trabajos where tipo='indice_jornadas' and estado='pendiente'`).get().n}`);

console.log('\n=== GRUPOS QUE YA HAN DEMOSTRADO NO PUBLICAR JORNADAS ===');
const grupos = db.prepare(`select temporada, competicion, grupo, count(*) as evidencias
  from trabajos
  where ultimo_error like ? and estado in ('cancelado','pendiente','hecho')
  group by 1,2,3 order by 4 desc`).all(SIN_JORNADAS + '%');
console.log(`  ${grupos.length} grupos con esa evidencia`);
for (const g of grupos.slice(0, 8)) {
  console.log(`    t${g.temporada} c${g.competicion} g${g.grupo}: ${g.evidencias} trabajos`);
}

let pendientes = 0;
for (const g of grupos) {
  pendientes += db.prepare(`select count(*) as n from trabajos
    where tipo='indice_jornadas' and estado='pendiente' and temporada=? and competicion=? and grupo=?`)
    .get(g.temporada, g.competicion, g.grupo).n;
}
console.log(`\n  índices pendientes en esos grupos: ${pendientes}`);

if (APLICAR && pendientes > 0) {
  let hechas = 0;
  for (const g of grupos) {
    const r = db.prepare(`update trabajos set estado='cancelado',
        ultimo_error='el grupo no publica ninguna jornada: su índice tampoco va a descubrir nada',
        actualizado_en=datetime('now')
      where tipo='indice_jornadas' and estado='pendiente' and temporada=? and competicion=? and grupo=?`)
      .run(g.temporada, g.competicion, g.grupo);
    hechas += Number(r.changes ?? 0);
  }
  console.log(`\n=== APLICADO: ${hechas} índices cancelados ===`);
} else if (!APLICAR) {
  console.log('\n(medición: no se ha cambiado nada. Con --aplicar se hace.)');
}

console.log('\n=== CÓMO QUEDA LA COLA ===');
for (const f of db.prepare(`select tipo, estado, count(*) as n from trabajos group by 1,2 order by 3 desc limit 10`).all()) {
  console.log(`  ${String(f.tipo).padEnd(18)} ${String(f.estado).padEnd(12)} ${f.n}`);
}
db.close();
