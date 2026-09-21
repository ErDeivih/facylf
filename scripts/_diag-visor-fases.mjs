#!/usr/bin/env node
/**
 * Compara las barras de fase que enseña el visor con las bases, descontando SÓLO los cancelados de
 * cada fase (que es lo correcto). Marca diferencias mayores de 1 %.
 *
 * Uso: node scripts/_diag-visor-fases.mjs
 */
import { DatabaseSync } from 'node:sqlite';

const F1 = `('catalogo_temporada','grupos','indice_jornadas','calendario','clasificacion')`;
const F2 = `('jornada','acta')`;
const visor = await (await fetch('http://127.0.0.1:3777/api/estado', { signal: AbortSignal.timeout(120_000) })).json();
console.log('federación            visor fase1     real fase1     visor fase2     real fase2    diferencias');
for (const f of visor.filter((x) => x.tipo === 'cola')) {
  const ruta = `descargas-${f.nombre === 'castilla-leon' ? 'federacion' : f.nombre}/recolector-local/cola-v2.sqlite`;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const b = db.prepare(`select
      coalesce(sum(tipo in ${F1} and estado='hecho'),0) f1Hecho,
      coalesce(sum(tipo in ${F1} and estado='cancelado'),0) f1Cancel,
      coalesce(sum(tipo in ${F1}),0) f1Total,
      coalesce(sum(tipo in ${F2} and estado='hecho'),0) f2Hecho,
      coalesce(sum(tipo in ${F2} and estado='cancelado'),0) f2Cancel,
      coalesce(sum(tipo in ${F2}),0) f2Total from trabajos`).get();
  db.close();
  const realF1 = b.f1Total - b.f1Cancel;
  const realF2 = b.f2Total - b.f2Cancel;
  const pctF1 = realF1 > 0 ? Math.round((b.f1Hecho / realF1) * 100) : 0;
  const pctF2 = realF2 > 0 ? Math.round((b.f2Hecho / realF2) * 100) : 0;
  const difs = [];
  if (Math.abs(f.fasesDescubrimiento.pct - pctF1) > 1) difs.push(`fase1 ${f.fasesDescubrimiento.pct}% ≠ ${pctF1}%`);
  if (Math.abs(f.fasesDatos.pct - pctF2) > 1) difs.push(`fase2 ${f.fasesDatos.pct}% ≠ ${pctF2}%`);
  console.log(`${f.nombre.padEnd(21)} ${String(f.fasesDescubrimiento.hecho).padStart(6)}/${String(f.fasesDescubrimiento.total).padStart(6)}  ${String(b.f1Hecho).padStart(6)}/${String(realF1).padStart(6)}  ${String(f.fasesDatos.hecho).padStart(6)}/${String(f.fasesDatos.total).padStart(6)}  ${String(b.f2Hecho).padStart(6)}/${String(realF2).padStart(6)}   ${difs.join(' · ')}`);
}
