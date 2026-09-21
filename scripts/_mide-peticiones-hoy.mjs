/*
 * ¿CUÁNTO CUESTA COMPROBAR EL PRESUPUESTO DIARIO? Antes y después.
 *
 * `peticionesHoy` se llama antes de CADA petición (es lo primero que mira el ritmo respetuoso). La versión
 * antigua traía la tabla `peticiones` entera y filtraba en JavaScript; después fue un `count` con índice de
 * expresión, y desde el 19/09/2026 es un `count` contra la columna `peticiones.dia_madrid` (que además arregló que
 * el cupo se contase por día de Madrid y no por día UTC). Esto mide las tres cosas sobre las colas de verdad, para
 * no hablar de memoria.
 *
 * Sólo lee. Uso: node scripts/_mide-peticiones-hoy.mjs [federacion...]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { diaDeMadrid } from './lib/dia-madrid.mjs';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const pedidas = process.argv.slice(2);
const fechaMadrid = diaDeMadrid();

const federaciones = readdirSync(raiz)
  .filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !pedidas.length || pedidas.includes(f))
  .sort();

const mide = (fn, veces = 20) => {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < veces; i++) fn();
  return Number(process.hrtime.bigint() - t0) / 1e6 / veces;
};

console.log(`═══ coste de comprobar el presupuesto diario (${fechaMadrid}) · media de 20 vueltas`);
console.log('  federación            peticiones   ANTES (tabla entera)   AHORA (columna del día)   veces más rápido');
for (const f of federaciones) {
  const ruta = join(raiz, `descargas-${f}`, 'recolector-local', 'cola-v2.sqlite');
  const db = new DatabaseSync(ruta, { readOnly: true });
  const total = Number(db.prepare('select count(*) n from peticiones').get()?.n ?? 0);
  const columnas = db.prepare('pragma table_info(peticiones)').all().map((c) => c.name);
  const sinDia = columnas.includes('dia_madrid')
    ? Number(db.prepare('select count(*) n from peticiones where dia_madrid is null').get()?.n ?? 0) : null;
  const antigua = mide(() => {
    const formato = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' });
    return db.prepare('select iniciada_en from peticiones').all()
      .filter((p) => formato.format(new Date(p.iniciada_en)) === fechaMadrid).length;
  }, total > 200000 ? 3 : 10);
  const nueva = mide(() => Number(db.prepare('select count(*) n from peticiones where dia_madrid = ?')
    .get(fechaMadrid)?.n ?? 0), 20);
  db.close();
  const veces = antigua / nueva;
  const aviso = sinDia === null ? '   (sin la columna todavía: la añade el recolector al arrancar)'
    : (sinDia > 0 ? `   (${sinDia} peticiones sin día: el relleno las pondrá al arrancar)` : '');
  console.log(`  ${f.padEnd(20)} ${String(total).padStart(10)}   ${antigua.toFixed(1).padStart(18)} ms   ${nueva.toFixed(3).padStart(21)} ms   ${veces.toFixed(0).padStart(16)}×${aviso}`);
}
