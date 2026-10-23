/*
 * revisa-calidad-federaciones.mjs — clasificación de menores y calidad real, federación por federación
 *
 * ── QUÉ HACE, Y EN QUÉ ORDEN ────────────────────────────────────────────────────────────────────────────
 *
 * 1. DETECTA la mala clasificación de «acta de menores» (el fallo de la «n» final, medido el 24/09/2026: en
 *    valenciano la categoría se escribe «Aleví», sin n, y la regla la exigía, así que miles de fichas de niños
 *    de 8 a 12 años quedaron marcadas como de adultos).
 * 2. LA CORRIGE, con `--aplicar`, usando el nombre de competición que ya está en la cola: no se le pide nada a
 *    ningún portal.
 * 3. Y MIDE la calidad separando ADULTOS de BASE, que es lo que hace útil el número. Antes de arreglar la
 *    clasificación, la base estaba dentro del grupo «adultos» y su porcentaje salía altísimo sin significar
 *    nada: en Valencia, «adultos» marcaba 64 % de descuadre y, una vez bien clasificado, resulta ser 0,8 %.
 *
 * El orden importa: medir antes de corregir da una foto falsa.
 *
 * SÓLO LEE si no se le pasa `--aplicar`.
 *
 * Uso:
 *   node scripts/servidor/revisa-calidad-federaciones.mjs <raíz>              (informa)
 *   node scripts/servidor/revisa-calidad-federaciones.mjs <raíz> --aplicar    (corrige y luego mide)
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const raiz = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
if (!raiz) {
  console.error('uso: revisa-calidad-federaciones.mjs <raíz> [--aplicar]');
  process.exit(2);
}

// La clasificación REAL, importada: una copia se desincroniza, y con esta ya pasó.
const { esCompeticionDeMenores } = await import('../lib/recolector-local.mjs');
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

const federaciones = readdirSync(raiz)
  .filter((d) => d.startsWith('descargas-') && existsSync(join(raiz, d, 'recolector-local', 'cola-v2.sqlite')))
  .map((d) => d.replace('descargas-', ''))
  .sort();

console.log(`══ clasificación de menores y calidad real · ${raiz}${aplicar ? ' · APLICANDO' : ' · sólo informe'} ══\n`);

let totalCorregidas = 0;
const resumen = [];

for (const fed of federaciones) {
  const ruta = join(raiz, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  const db = new DatabaseSync(ruta, { readOnly: !aplicar, timeout: 120_000 });

  // ── 1 y 2. La clasificación ───────────────────────────────────────────────────────────────────────────
  const porCompeticion = db.prepare(`select a.temporada, a.competicion,
      sum(case when a.menores = 1 then 1 else 0 end) menores,
      sum(case when a.menores = 0 then 1 else 0 end) adultos,
      (select nombre from competiciones c where c.temporada = a.temporada and c.codigo = a.competicion) nombre
    from actas a group by a.temporada, a.competicion`).all();

  const aCorregir = [];
  for (const f of porCompeticion) {
    const deberia = esCompeticionDeMenores(f.nombre ?? '') ? 1 : 0;
    if (deberia === 1 && Number(f.adultos) > 0) aCorregir.push({ ...f, valor: 1, cuantas: Number(f.adultos) });
    else if (deberia === 0 && Number(f.menores) > 0) aCorregir.push({ ...f, valor: 0, cuantas: Number(f.menores) });
  }
  const actasAReclasificar = aCorregir.reduce((s, c) => s + c.cuantas, 0);

  let corregidas = 0;
  if (aplicar && aCorregir.length) {
    db.exec('begin immediate');
    try {
      const actualiza = db.prepare(`update actas set menores = ? where temporada = ? and competicion = ? and menores <> ?`);
      for (const c of aCorregir) corregidas += Number(actualiza.run(c.valor, c.temporada, c.competicion, c.valor).changes ?? 0);
      db.exec('commit');
    } catch (e) { db.exec('rollback'); throw e; }
    totalCorregidas += corregidas;
  }

  // ── 3. La calidad, ya con la clasificación buena ───────────────────────────────────────────────────────
  const calidad = [];
  for (const [etiqueta, condicion] of [['adultos', 0], ['base', 1]]) {
    const r = db.prepare(`select count(*) hechas,
        sum(case when incidencias is not null and trim(incidencias) not in ('','[]') then 1 else 0 end) conIncidencia,
        sum(case when incidencias like '%descuadre_goles%' then 1 else 0 end) descuadre,
        sum(case when incidencias like '%no_distingue_titulares%' then 1 else 0 end) sinTitulares,
        sum(case when incidencias like '%sin_alineaciones%' then 1 else 0 end) sinAlineaciones
      from actas where estado='hecha' and menores = ?`).get(condicion);
    calidad.push({ etiqueta, ...r });
  }

  console.log(`── ${fed}`);
  if (actasAReclasificar) {
    console.log(`   clasificación: ${n(actasAReclasificar)} actas MAL marcadas en ${aCorregir.length} competiciones`
      + (aplicar ? ` → corregidas ${n(corregidas)}` : ' (sin aplicar)'));
  } else {
    console.log('   clasificación: correcta');
  }
  for (const c of calidad) {
    if (!Number(c.hechas)) continue;
    const pct = (v) => `${((Number(v) / Number(c.hechas)) * 100).toFixed(1)} %`;
    console.log(`   ${c.etiqueta.padEnd(8)} ${String(n(c.hechas)).padStart(8)} actas · incidencias ${pct(c.conIncidencia).padStart(6)}`
      + ` · descuadre ${pct(c.descuadre).padStart(6)} · sin titulares ${pct(c.sinTitulares).padStart(6)} · sin alineac. ${pct(c.sinAlineaciones).padStart(6)}`);
  }
  resumen.push({ fed, actasAReclasificar, adultos: calidad[0], base: calidad[1] });
  db.close();
}

console.log('\n══ resumen de la flota ══');
const conProblema = resumen.filter((r) => r.actasAReclasificar > 0);
console.log(`  federaciones con actas mal clasificadas: ${conProblema.length}`
  + (conProblema.length ? ` (${conProblema.map((r) => `${r.fed}: ${n(r.actasAReclasificar)}`).join(', ')})` : ''));
console.log(`  actas corregidas en total: ${n(totalCorregidas)}`);
console.log('\n  calidad de ADULTOS (lo que de verdad importa para el dato de jugadores):');
for (const r of resumen) {
  const c = r.adultos;
  if (!Number(c.hechas)) continue;
  const pct = ((Number(c.conIncidencia) / Number(c.hechas)) * 100).toFixed(1);
  console.log(`     ${r.fed.padEnd(20)} ${String(n(c.hechas)).padStart(8)} actas · ${pct.padStart(5)} % con incidencia`);
}
