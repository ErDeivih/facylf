/*
 * ¿Cuánto trabajo imposible hay en una cola? Trabajos cuyo último error dice que la fuente no publica nada,
 * con sus intentos y su próxima fecha: distingue «se reintenta y algún día saldrá» de «rueda que gira para
 * siempre y se come el presupuesto de peticiones».
 *
 * Sólo lee. Uso: node scripts/_diag-trabajo-imposible.mjs <federacion>
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federacion = process.argv[2] ?? 'valencia';
const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.log('no hay cola'); process.exit(0); }

const db = new DatabaseSync(ruta, { readOnly: true });
const ahora = new Date().toISOString();
const patron = process.argv[3] ?? 'no publica';
const filas = db.prepare(`select tipo, estado, intentos, count(*) n, min(siguiente_intento) desde, max(siguiente_intento) hasta
  from trabajos where ultimo_error like ? group by tipo, estado, intentos order by n desc limit 20`).all(`%${patron}%`);
console.log(`═══ ${federacion}: trabajos cuyo último error contiene «${patron}»`);
for (const f of filas) {
  console.log(`  ${String(f.tipo).padEnd(16)} ${String(f.estado).padEnd(10)} intentos=${String(f.intentos ?? '-').padEnd(3)} ${String(f.n).padStart(6)}  ${f.desde ?? '-'} → ${f.hasta ?? '-'}`);
}
const total = db.prepare(`select count(*) n from trabajos where ultimo_error like ?`).get(`%${patron}%`).n;
const vencidos = db.prepare(`select count(*) n from trabajos where ultimo_error like ? and estado='pendiente'
  and (siguiente_intento is null or siguiente_intento <= ?)`).get(`%${patron}%`, ahora).n;
console.log(`  total en ese estado: ${total} · ya vencidos (se van a volver a pedir): ${vencidos}`);
console.log(`  peticiones de esa federación en las últimas 24 h:`);
for (const r of db.prepare(`select resultado, count(*) n from peticiones where iniciada_en >= ?
  group by resultado order by n desc limit 5`).all(new Date(Date.now() - 86400000).toISOString())) {
  console.log(`    ${String(r.resultado).padEnd(18)} ${r.n}`);
}
db.close();
