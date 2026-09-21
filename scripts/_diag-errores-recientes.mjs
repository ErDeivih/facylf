#!/usr/bin/env node
/** Errores de las últimas N horas, agrupados y en total, sin mezclar con lo ya conocido. */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

const horas = Number(process.argv[2] ?? 1);
const desde = new Date(Date.now() - horas * 3600_000).toISOString();
let total = 0;
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  let filas = [];
  try {
    filas = db.prepare(`select resultado, detalle, count(*) n from peticiones
      where iniciada_en > ? and resultado not in ('ok','sin_publicar')
      group by resultado, detalle order by n desc limit 6`).all(desde);
  } catch { /* columna distinta */ }
  const total2 = db.prepare(`select count(*) n from peticiones where iniciada_en > ? and resultado not in ('ok','sin_publicar')`)
    .get(desde).n;
  if (total2) {
    console.log(`== ${d.replace('descargas-', '')}: ${total2} errores en ${horas} h`);
    for (const f of filas) console.log(`   ${f.n} × [${f.resultado}] ${String(f.detalle ?? '').slice(0, 110)}`);
  }
  total += total2;
  db.close();
}
console.log(`TOTAL errores en las últimas ${horas} h: ${total}`);
