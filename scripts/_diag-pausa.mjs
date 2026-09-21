/*
 * ¿Por qué está en pausa esta federación, y con qué fallos? Muestra la marca de pausa (hasta y motivo) y los
 * últimos fallos con su mensaje, que es lo que hace falta para decidir si la pausa es justa o es de casa.
 *
 * Sólo lee. Uso: node scripts/_diag-pausa.mjs <federacion> [cuantos=12]
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federacion = process.argv[2] ?? 'madrid';
const cuantos = Number(process.argv[3] ?? 12);
const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.log('no hay cola'); process.exit(0); }

const db = new DatabaseSync(ruta, { readOnly: true });
const metadato = (clave) => db.prepare('select valor from metadatos where clave=?').get(clave)?.valor ?? '';
const hasta = metadato('pausa_global_hasta');
const motivo = metadato('pausa_global_motivo');
const ahora = Date.now();
console.log(`═══ ${federacion}`);
console.log(`  pausa: ${hasta ? `${hasta} (${hasta && new Date(hasta).getTime() > ahora ? 'ACTIVA, quedan ' + Math.round((new Date(hasta).getTime() - ahora) / 60000) + ' min' : 'vencida'})` : '(no hay)'}`);
console.log(`  motivo: ${motivo || '(sin motivo)'}`);
console.log(`  pausas puestas en las últimas 6 h:`);
for (const e of db.prepare(`select creado_en, substr(detalle,1,120) det from eventos where tipo='pausa_global' and creado_en >= ? order by id desc`).all(new Date(ahora - 6 * 3600_000).toISOString())) {
  console.log(`    ${e.creado_en}  ${e.det}`);
}
console.log(`  últimos ${cuantos} fallos:`);
for (const r of db.prepare(`select iniciada_en, resultado, detalle from peticiones where resultado <> 'ok' order by id desc limit ?`).all(cuantos)) {
  console.log(`    ${r.iniciada_en}  ${String(r.resultado).padEnd(16)} ${String(r.detalle ?? '').replace(/\s+/g, ' ').slice(0, 100)}`);
}
db.close();
