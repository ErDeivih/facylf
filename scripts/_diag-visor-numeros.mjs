#!/usr/bin/env node
/**
 * Comprueba los números que enseña el visor contra las bases, con las mismas fórmulas que usa
 * (`scripts/visor-workers.mjs`), y avisa de los que no cuadran:
 *   · total = hecho + pend + cancelados + bloqueados
 *   · las fases no pueden tener más cancelados que trabajos
 *   · los porcentajes no pueden salirse de 0..100
 *
 * Uso: node scripts/_diag-visor-numeros.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const visor = await (await fetch('http://127.0.0.1:3777/api/estado', { signal: AbortSignal.timeout(120_000) })).json();
const TIPOS_F1 = `('catalogo_temporada','grupos','indice_jornadas','calendario','clasificacion')`;
const TIPOS_F2 = `('jornada','acta')`;

console.log('federación            visor: total/hecho/pend/cancel   base: f1Total f1Cancel f2Total f2Cancel   total-cancel  avisos');
const problemas = [];
for (const f of visor.filter((x) => x.tipo === 'cola')) {
  const ruta = `descargas-${f.nombre}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) { problemas.push(`${f.nombre}: no existe ${ruta}`); continue; }
  const db = new DatabaseSync(ruta, { readOnly: true });
  const uno = (sql) => db.prepare(sql).get();
  const base = uno(`select
      count(*) total,
      coalesce(sum(estado='hecho'),0) hecho,
      coalesce(sum(estado in ('pendiente','en_curso','bloqueado')),0) pend,
      coalesce(sum(estado='cancelado'),0) cancel,
      coalesce(sum(tipo in ${TIPOS_F1}),0) f1Total,
      coalesce(sum(tipo in ${TIPOS_F1} and estado='cancelado'),0) f1Cancel,
      coalesce(sum(tipo in ${TIPOS_F2}),0) f2Total,
      coalesce(sum(tipo in ${TIPOS_F2} and estado='cancelado'),0) f2Cancel
    from trabajos`);
  db.close();

  const avisos = [];
  const suma = base.hecho + base.pend + base.cancel;
  if (suma !== base.total) avisos.push(`total no cuadra: ${base.total} ≠ ${suma}`);
  if (f.total !== base.total) avisos.push(`total del visor ${f.total} ≠ base ${base.total}`);
  if (f.pend !== base.pend) avisos.push(`pendientes del visor ${f.pend} ≠ base ${base.pend}`);
  if (f.cancelados !== base.cancel) avisos.push(`cancelados del visor ${f.cancelados} ≠ base ${base.cancel}`);

  // Lo que hace el visor: fases.total = f1Total - cancelados (TODOS los cancelados, también los de fase 2)
  const totalFase1Visor = base.f1Total - base.cancel;
  if (totalFase1Visor < 0) avisos.push(`fase 1 con total NEGATIVO (${totalFase1Visor}): f1Total ${base.f1Total} − cancelados ${base.cancel}`);
  else if (totalFase1Visor < base.f1Total * 0.5 && base.f2Cancel > 0) {
    avisos.push(`fase 1 encogida por cancelados de la fase 2: ${base.f1Total} → ${totalFase1Visor} (${base.f1Cancel} propios, ${base.f2Cancel} ajenos)`);
  }
  const pctEstructura = f.pctEstructura;
  if (pctEstructura != null && (pctEstructura < 0 || pctEstructura > 100)) avisos.push(`pctEstructura fuera de rango: ${pctEstructura}`);

  console.log(`${f.nombre.padEnd(21)} ${String(f.total).padStart(6)}/${String(f.hecho).padStart(6)}/${String(f.pend).padStart(6)}/${String(f.cancelados).padStart(6)}   ${String(base.f1Total).padStart(6)} ${String(base.f1Cancel).padStart(8)} ${String(base.f2Total).padStart(8)} ${String(base.f2Cancel).padStart(8)}   ${String(totalFase1Visor).padStart(10)}  ${avisos.join(' · ')}`);
  if (avisos.length) problemas.push(`${f.nombre}: ${avisos.join(' · ')}`);
}
console.log(`\n${problemas.length} avisos:`);
for (const p of problemas) console.log(`  · ${p}`);
