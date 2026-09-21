#!/usr/bin/env node
/** Últimas peticiones de una cola con sus huecos, para ver si hay esperas anómalas. */
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2], { readOnly: true });
const filas = db.prepare('select iniciada_en, duracion_ms, resultado, detalle, url from peticiones order by id desc limit 8').all().reverse();
let anterior = null;
for (const f of filas) {
  const t = new Date(f.iniciada_en).getTime();
  const hueco = anterior ? Math.round((t - anterior) / 1000) : null;
  console.log(`${f.iniciada_en} (+${f.duracion_ms} ms${hueco !== null ? `, hueco ${hueco} s` : ''}) ${f.resultado} ${String(f.detalle ?? '').slice(0, 30)} ${f.url.slice(0, 90)}`);
  anterior = t + f.duracion_ms;
}
db.close();
