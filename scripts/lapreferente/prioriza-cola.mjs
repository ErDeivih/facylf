/**
 * Adelanta en la cola de lapreferente-federado los calendarios históricos de las comunidades de `calendarios_primero`
 * (scripts/multideporte/lapreferente-fichas.json; hoy Cataluña): de prioridad 20 a 15.
 *
 * Los calendarios ya encolados no dicen de qué comunidad son (la página de la semilla trae IDccaa 0), así que lo que
 * se hace es volver a leer las ~324 páginas de región (prioridad 5-6, ~40 min de recolector): con el código del
 * 26/10 reconocen la comunidad por las etiquetas de sus grupos y vuelven a encolar sus calendarios, y el motor se
 * queda con la prioridad menor (15). No pide nada por su cuenta: sólo cambia fechas de la cola.
 *
 *   node scripts/lapreferente/prioriza-cola.mjs            cuenta lo que cambiaría
 *   node scripts/lapreferente/prioriza-cola.mjs --aplica   lo cambia (dos sentencias; el recolector puede seguir)
 * Claude, 26/10/2026.
 */
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ccaaPrimero } from '../multideporte/adaptadores/lapreferente-federado.mjs';
import { RAIZ } from './lib.mjs';

const i = process.argv.indexOf('--cola');
const ruta = fileURLToPath(new URL(i > 0 ? process.argv[i + 1] : 'descargas-multideporte/lapreferente-federado/cola.sqlite', RAIZ));
const ccaa = [...ccaaPrimero()];
if (!ccaa.length) { console.log('calendarios_primero vacío: nada que hacer.'); process.exit(0); }
const db = new DatabaseSync(ruta, { timeout: 60_000 });
const A = 'lapreferente-federado';
const regiones = db.prepare(`select count(*) n from paginas where adaptador = ? and tipo = 'region' and estado = 'pendiente'
  and siguiente_intento > ?`).get(A, new Date().toISOString()).n;
const donde = `adaptador = '${A}' and tipo = 'calendario' and estado = 'pendiente' and prioridad > 15
  and cast(json_extract(contexto, '$.ccaa_lp') as text) in (${ccaa.map(() => '?').join(',')})`;
const conCcaa = db.prepare(`select count(*) n from paginas where ${donde}`).get(...ccaa).n;
console.log(`Comunidades primero: ${ccaa.join(', ')}. Páginas de región que se releerían ya: ${regiones}. Calendarios ya marcados con esa comunidad y prioridad > 15: ${conCcaa}.`);
if (process.argv.includes('--aplica')) {
  const r1 = db.prepare(`update paginas set siguiente_intento = ? where adaptador = ? and tipo = 'region' and estado = 'pendiente'
    and siguiente_intento > ?`).run(new Date().toISOString(), A, new Date().toISOString());
  const r2 = db.prepare(`update paginas set prioridad = 15 where ${donde}`).run(...ccaa);
  console.log(`Regiones adelantadas: ${r1.changes} · calendarios subidos a 15: ${r2.changes}. Hace falta que el proceso del recolector se haya relanzado con el código nuevo (lo hace solo tras cada --max 200).`);
}
db.close();
