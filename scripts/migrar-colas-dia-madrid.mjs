#!/usr/bin/env node
/*
 * ADELANTA EL DÍA DE MADRID EN LAS COLAS: añade la columna `peticiones.dia_madrid`, rellena lo que había y deja el
 * índice del cupo diario en su sitio.
 *
 * Desde el 19/09/2026 el presupuesto diario se cuenta por el **día civil de Madrid**, y para eso cada petición
 * guarda su día. El recolector lo hace solo la primera vez que abre cada cola (`abreBase`), así que en el servidor
 * **no hace falta ejecutar esto**: se puede arrancar la flota y cada federación migra la suya. Pero adelantarlo
 * tiene dos ventajas: se sabe cuánto tarda antes de arrancar (y cuántas peticiones había sin día) y se puede hacer
 * en una ventana tranquila en vez de en el primer arranque de cada contenedor.
 *
 * Es idempotente: la segunda vez no hace nada. Sólo escribe en la cola (nada de datos de negocio).
 *
 * Uso:
 *   node scripts/migrar-colas-dia-madrid.mjs                 # todas las colas del proyecto
 *   node scripts/migrar-colas-dia-madrid.mjs galicia rioja   # sólo esas
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { abreBase } from './lib/recolector-local.mjs';

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const pedidas = process.argv.slice(2);
const federaciones = readdirSync(raiz)
  .filter((n) => n.startsWith('descargas-') && existsSync(join(raiz, n, 'recolector-local', 'cola-v2.sqlite')))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !pedidas.length || pedidas.includes(f))
  .sort();

console.log(`═══ día de Madrid en las colas · ${federaciones.length} federación(es)`);
let totalPeticiones = 0;
let totalRellenadas = 0;
let totalMs = 0;
for (const federacion of federaciones) {
  const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  const antes = (() => {
    const db = new DatabaseSync(ruta, { readOnly: true });
    try {
      const peticiones = db.prepare('select count(*) n from peticiones').get().n;
      const tenia = db.prepare('pragma table_info(peticiones)').all().some((c) => c.name === 'dia_madrid');
      const sinDia = tenia ? db.prepare('select count(*) n from peticiones where dia_madrid is null').get().n : null;
      return { peticiones, tenia, sinDia };
    } finally { db.close(); }
  })();

  const t0 = process.hrtime.bigint();
  const db = abreBase(ruta);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const sinDia = db.prepare('select count(*) n from peticiones where dia_madrid is null').get().n;
  const usaIndice = db.prepare('explain query plan select count(*) n from peticiones where dia_madrid = ?').all('2000-01-01')
    .some((p) => String(p.detail).includes('peticiones_dia'));
  db.close();

  totalPeticiones += antes.peticiones;
  totalRellenadas += antes.sinDia ?? 0;
  totalMs += ms;
  console.log(`  ${federacion.padEnd(20)} ${String(antes.peticiones).padStart(7)} peticiones`
    + ` · columna: ${antes.tenia ? 'ya estaba' : 'añadida'}`
    + ` · sin día antes: ${antes.sinDia === null ? '—' : antes.sinDia}`
    + ` · sin día después: ${sinDia}${sinDia === 0 ? ' ✓' : ' ✗'}`
    + ` · índice: ${usaIndice ? 'usado ✓' : 'NO usado ✗'} · ${ms.toFixed(0)} ms`);
}
console.log(`  TOTAL: ${totalPeticiones} peticiones · ${totalRellenadas} rellenadas · ${(totalMs / 1000).toFixed(1)} s`);
process.exitCode = 0;
