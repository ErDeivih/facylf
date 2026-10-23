#!/usr/bin/env node
/*
 * ritmo-cola.mjs — SÓLO LEE. Trabajos terminados por hora en las últimas N horas (por `actualizado_en` de los
 * que ya no están pendientes), por tipo. Mide lo que la cola ha avanzado de verdad, no lo que dice un registro.
 * Uso: node ritmo-cola.mjs <cola-v2.sqlite> [horas=12]
 */
import { DatabaseSync } from 'node:sqlite';
const [, , ruta, horas = '12'] = process.argv;
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 120000 });
const desde = new Date(Date.now() - Number(horas) * 3600e3).toISOString();
const filas = db.prepare(`select substr(actualizado_en,1,13) h, tipo, count(*) n from trabajos
  where actualizado_en >= ? and estado not in ('pendiente','en_curso') group by 1,2 order by 1`).all(desde);
const porHora = new Map();
for (const f of filas) { const e = porHora.get(f.h) ?? {}; e[f.tipo] = f.n; porHora.set(f.h, e); }
for (const [h, e] of porHora) {
  const total = Object.values(e).reduce((a, b) => a + b, 0);
  console.log(`  ${h}h UTC  ${String(total).padStart(5)}  ${Object.entries(e).map(([t, n]) => `${t} ${n}`).join(' · ')}`);
}
const pend = db.prepare(`select count(*) n, sum(case when siguiente_intento is null or siguiente_intento <= ? then 1 else 0 end) v
  from trabajos where estado='pendiente'`).get(new Date().toISOString());
console.log(`  pendientes ${pend.n} · vencidos ${pend.v}`);
db.close();
