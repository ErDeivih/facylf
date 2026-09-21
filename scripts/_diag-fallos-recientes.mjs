/*
 * ¿Qué está fallando AHORA? Una línea por federación con las peticiones de la última hora agrupadas por
 * resultado, para distinguir «va bien» de «falla todo» sin leer 18 registros.
 *
 * Sólo lee. Uso: node scripts/_diag-fallos-recientes.mjs [minutos]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const minutos = Number(process.argv[2] ?? 60);
const desde = new Date(Date.now() - minutos * 60000).toISOString();

let totalOk = 0; let totalMal = 0;
for (const carpeta of readdirSync(raiz).filter((n) => n.startsWith('descargas-')).sort()) {
  const ruta = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select resultado, count(*) n from peticiones where iniciada_en >= ? group by resultado order by n desc`).all(desde);
  if (!filas.length) { db.close(); continue; }
  const ok = filas.find((f) => f.resultado === 'ok')?.n ?? 0;
  const mal = filas.filter((f) => f.resultado !== 'ok').reduce((n, f) => n + f.n, 0);
  totalOk += ok; totalMal += mal;
  const detalle = filas.filter((f) => f.resultado !== 'ok').map((f) => `${f.resultado}=${f.n}`).join(' ');
  const ultimo = db.prepare(`select detalle from peticiones where resultado <> 'ok' order by id desc limit 1`).get()?.detalle ?? '';
  console.log(`  ${carpeta.replace('descargas-', '').padEnd(20)} ok=${String(ok).padStart(4)} mal=${String(mal).padStart(4)}  ${detalle}`);
  if (mal) console.log(`      último fallo: ${String(ultimo).replace(/\s+/g, ' ').slice(0, 120)}`);
  db.close();
}
console.log(`\n  TOTAL en ${minutos} min: ok=${totalOk} · con incidencia=${totalMal}` +
  (totalOk + totalMal ? ` (${Math.round((totalOk / (totalOk + totalMal)) * 100)} % de acierto)` : ''));
