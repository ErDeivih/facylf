/*
 * Ritmo real de las cuatro federaciones del PC, medido igual para todas: actas guardadas y cuántas en la
 * última hora. Es la única forma de saber si Valencia va mal o si simplemente tiene otro trabajo pendiente.
 */
import { DatabaseSync } from 'node:sqlite';

const colas = [
  ['castilla-leon', 'descargas-federacion/recolector-local/cola-v2.sqlite'],
  ['valencia', 'descargas-valencia/recolector-local/cola-v2.sqlite'],
  ['madrid', 'descargas-madrid/recolector-local/cola-v2.sqlite'],
  ['cataluna', 'descargas-cataluna/recolector-local/cola-v2.sqlite'],
];

console.log('federacion       actas_guard   ultima_hora   pendientes   idx_jornadas_pend   errores');
for (const [nombre, ruta] of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const actas = db.prepare('select count(*) as n from actas').get().n;
  const ultimaHora = db.prepare(`select count(*) as n from actas where comprobada_en > datetime('now','-1 hour')`).get().n;
  const pend = db.prepare("select count(*) as n from trabajos where estado='pendiente'").get().n;
  const idx = db.prepare("select count(*) as n from trabajos where tipo='indice_jornadas' and estado='pendiente'").get().n;
  const err = db.prepare('select count(*) as n from trabajos where ultimo_error is not null').get().n;
  console.log(`${nombre.padEnd(16)} ${String(actas).padStart(11)} ${String(ultimaHora).padStart(13)} ${String(pend).padStart(12)} ${String(idx).padStart(19)} ${String(err).padStart(9)}`);

  // Y los tres tipos con más trabajo pendiente, para ver en qué se va el tiempo
  const tipos = db.prepare(`select tipo, count(*) as n from trabajos where estado='pendiente' group by 1 order by 2 desc limit 3`).all();
  console.log(`                 pendientes por tipo: ${tipos.map((t) => `${t.tipo}=${t.n}`).join(' · ')}`);
  db.close();
}
