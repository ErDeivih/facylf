#!/usr/bin/env node
/** Las peticiones de una federación en una ventana de tiempo, para ver un patrón de fallos. */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, desdeIso, limite] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
const filas = db.prepare(`select iniciada_en, trabajo, resultado, duracion_ms, detalle from peticiones
  where iniciada_en >= ? order by iniciada_en limit ?`).all(desdeIso, Number(limite ?? 60));
for (const f of filas) {
  console.log(`${f.iniciada_en} ${String(f.duracion_ms).padStart(7)} ms [${String(f.resultado).padEnd(12)}] ${String(f.trabajo ?? '').slice(0, 46)} ${String(f.detalle ?? '').slice(0, 60)}`);
}
const resumen = db.prepare(`select resultado, count(*) n from peticiones where iniciada_en >= ?
  group by resultado order by n desc`).all(desdeIso);
console.log('resumen:', resumen.map((r) => `${r.resultado}=${r.n}`).join(' · '));
db.close();
