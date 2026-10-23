/*
 * comprueba-apartado-competicion.mjs — ¿a cuántos trabajos afectaría apartar una competición?
 *
 * ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * El 24/09/2026 se añadió a Madrid (y a Valencia) un apartado por competición: cuando una competición acumula 4
 * fallos de red seguidos, se le pone fecha a todo lo que le queda para que el recolector pase a otra, en vez de
 * encadenar fallos hasta la pausa de una hora. El contador se verificó funcionando (llegó a 3 de 4), pero el
 * APARTADO en sí no se había visto disparar.
 *
 * La única pieza que quedaba sin comprobar era el SQL del apartado. Aquí se ejecuta SU MISMA CONDICIÓN en modo
 * CONSULTA: dice a cuántos trabajos afectaría y de qué temporadas son, sin escribir nada. Así se comprueba que
 * la condición selecciona lo que debe —los pendientes de esa competición que no estén ya apartados— en vez de
 * confiar en que lo hará.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/comprueba-apartado-competicion.mjs <ruta-cola.sqlite> <temporada> <competicion>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [, , ruta, temporada, competicion] = process.argv;
if (!ruta || !temporada || !competicion) {
  console.error('uso: comprueba-apartado-competicion.mjs <ruta-cola.sqlite> <temporada> <competicion>');
  process.exit(2);
}
if (!existsSync(ruta)) { console.error(`no existe la cola: ${ruta}`); process.exit(2); }

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const hasta = new Date(Date.now() + 3 * 60 * 60_000).toISOString();

// MISMA condición que usa el recolector al apartar, pero como consulta.
const filas = db.prepare(`select tipo, estado, count(*) n from trabajos
  where temporada=? and competicion=? and estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento < ?)
  group by tipo, estado order by n desc`).all(String(temporada), String(competicion), hasta);

const total = filas.reduce((s, f) => s + Number(f.n), 0);
console.log(`cola:        ${ruta}`);
console.log(`competición: ${competicion} (temporada ${temporada})`);
console.log(`a apartar 3 h: ${total} trabajos`);
for (const f of filas) console.log(`   ${String(f.tipo).padEnd(16)} ${String(f.estado).padEnd(10)} ${f.n}`);

// Control: cuántos trabajos tiene esa competición en total, para saber que la condición no se lo lleva todo.
const todos = db.prepare(`select count(*) n from trabajos where temporada=? and competicion=?`)
  .get(String(temporada), String(competicion)).n;
console.log(`control: esa competición tiene ${todos} trabajos en total (hechos incluidos)`);
if (total === 0) console.log('AVISO: la condición no apartaría NADA; revisa la temporada o la competición.');
db.close();
