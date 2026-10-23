#!/usr/bin/env node
/* que-sirve.mjs — SÓLO LEE. Qué temporadas se han servido en las últimas N horas y qué hay vencido ahora, por
 * temporada y tipo: para ver si la temporada en curso va por delante del histórico.
 * Uso: node que-sirve.mjs <cola-v2.sqlite> [horas=3] */
import { DatabaseSync } from 'node:sqlite';
const [, , ruta, horas = '3'] = process.argv;
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60000 });
const et = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [String(t.codigo), t.etiqueta]));
const ahora = new Date().toISOString(), desde = new Date(Date.now() - Number(horas) * 3600e3).toISOString();
const linea = (rows) => rows.map((r) => `${et.get(String(r.temporada)) ?? r.temporada} ${r.tipo} ${r.n}`).join(' · ');
console.log(`  servido ${horas} h: ` + linea(db.prepare(`select temporada, tipo, count(*) n from trabajos where estado not in ('pendiente','en_curso')
  and actualizado_en>=? group by 1,2 order by 3 desc limit 12`).all(desde)));
console.log('  vencido ahora (2026-27): ' + linea(db.prepare(`select temporada, tipo, count(*) n, min(prioridad) p from trabajos where estado='pendiente'
  and (siguiente_intento is null or siguiente_intento<=?) and temporada in (select codigo from temporadas where etiqueta='2026-27') group by 1,2 order by 3 desc`).all(ahora)));
const p = db.prepare(`select min(prioridad) p from trabajos where estado='pendiente' and (siguiente_intento is null or siguiente_intento<=?)
  and temporada in (select codigo from temporadas where etiqueta=?)`);
console.log(`  prioridad mínima vencida: 2026-27 ${p.get(ahora, '2026-27').p} · 2025-26 ${p.get(ahora, '2025-26').p} · 2020-21 ${p.get(ahora, '2020-21').p} · 2015-16 ${p.get(ahora, '2015-16').p}`);
console.log('  próximas vencidas por prioridad: ' + db.prepare(`select t.etiqueta e, w.tipo, w.prioridad from trabajos w join temporadas t on t.codigo=w.temporada
  where w.estado='pendiente' and (w.siguiente_intento is null or w.siguiente_intento<=?) and t.etiqueta>='2010-11' order by w.prioridad limit 8`).all(ahora)
  .map((r) => `${r.e}/${r.tipo}/${r.prioridad}`).join(' '));
db.close();
