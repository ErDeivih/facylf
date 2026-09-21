/*
 * ¿Usa SQLite el índice del presupuesto diario? El plan de la consulta lo dice, y es la forma de comprobar que el
 * arreglo sirve de verdad: sin índice, cada petición recorre la tabla entera.
 *
 * Desde el 19/09/2026 la consulta del cupo diario es una igualdad contra `peticiones.dia_madrid` (el día civil de
 * Madrid de cada petición), así que esto comprueba ESA consulta y avisa si la cola todavía no tiene la columna: en
 * ese caso la añade el recolector la próxima vez que arranca (`abreBase`).
 *
 * Uso: node scripts/_explain-presupuesto.mjs [federacion]
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { diaDeMadrid } from './lib/dia-madrid.mjs';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federacion = process.argv[2] ?? 'galicia';
const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) { console.error(`  no hay cola en ${ruta}`); process.exit(1); }

const db = new DatabaseSync(ruta, { readOnly: true });
const dia = diaDeMadrid();
const columnas = db.prepare('pragma table_info(peticiones)').all().map((c) => c.name);
const tieneColumna = columnas.includes('dia_madrid');
const plan = tieneColumna
  ? db.prepare('explain query plan select count(*) n from peticiones where dia_madrid = ?').all(dia)
  : [];
const usaIndice = plan.some((p) => String(p.detail).includes('peticiones_dia'));
const sqlIndice = db.prepare("select sql from sqlite_master where type='index' and name='peticiones_dia'").get()?.sql ?? null;
const total = db.prepare('select count(*) n from peticiones').get().n;
const sinDia = tieneColumna ? db.prepare('select count(*) n from peticiones where dia_madrid is null').get().n : null;
db.close();

console.log(`═══ plan de la consulta del presupuesto diario · ${federacion} (${total} peticiones)`);
if (!tieneColumna) {
  console.log('  la cola todavía no tiene la columna `dia_madrid`: la añade y la rellena el recolector al arrancar.');
  console.log('  (o se adelanta con `node scripts/migrar-colas-dia-madrid.mjs ' + federacion + '`)');
} else {
  for (const p of plan) console.log(`  ${p.detail}`);
  console.log(`  índice: ${sqlIndice ?? '(no existe)'}`);
  console.log(`  lo usa: ${usaIndice ? 'SÍ ✓' : 'NO ✗'} · peticiones sin día: ${sinDia}${sinDia === 0 ? ' ✓' : ' (el relleno las pondrá al arrancar)'}`);
}
