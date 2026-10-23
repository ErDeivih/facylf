/*
 * incidencias-adultos.mjs — de qué se queja el analizador, solo en actas de ADULTOS
 *
 * ── POR QUÉ SOLO ADULTOS ────────────────────────────────────────────────────────────────────────────────
 *
 * El total agregado engaña: las actas de base (fútbol 7 infantil) acumulan incidencias que son limitaciones de
 * la fuente —no publica goleadores, no distingue titulares— y tapan lo que de verdad importa. Medido el
 * 24/09/2026, Valencia marcaba 60 % de incidencias en total y **4,3 % en adultos**.
 *
 * Así que aquí se mira SOLO lo de adultos, y se listan los TIPOS de incidencia con su cuenta, que es lo que
 * permite atacar cada problema en vez de mirar un porcentaje.
 *
 * SÓLO LEE.
 *
 * Uso:  node scripts/servidor/incidencias-adultos.mjs <ruta-cola.sqlite>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
if (!ruta || !existsSync(ruta)) {
  console.error('uso: incidencias-adultos.mjs <ruta-cola.sqlite>');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

const total = db.prepare(`select count(*) n from actas where estado='hecha' and menores = 0`).get().n;
const conAviso = db.prepare(`select count(*) n from actas where estado='hecha' and menores = 0
  and incidencias is not null and trim(incidencias) not in ('','[]')`).get().n;

console.log(`cola: ${ruta}`);
console.log(`actas de adultos: ${n(total)} · con alguna incidencia: ${n(conAviso)}`
  + ` (${((Number(conAviso) / Math.max(1, Number(total))) * 100).toFixed(1)} %)\n`);

// Se cuentan por tipo, quedándose con el nombre antes de los dos puntos (que son los números del caso).
const filas = db.prepare(`select incidencias from actas
  where estado='hecha' and menores = 0 and incidencias is not null and trim(incidencias) not in ('','[]')`).all();
const cuenta = new Map();
const ejemplos = new Map();
for (const f of filas) {
  let lista = [];
  try { lista = JSON.parse(f.incidencias); } catch { lista = [String(f.incidencias)]; }
  for (const texto of (Array.isArray(lista) ? lista : [lista])) {
    const clave = String(texto).split(':')[0].trim();
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
    if (!ejemplos.has(clave)) ejemplos.set(clave, String(texto));
  }
}

console.log('  tipo de incidencia                              actas      % de adultos   ejemplo');
for (const [clave, cuantos] of [...cuenta.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  const pct = ((cuantos / Math.max(1, Number(total))) * 100).toFixed(1);
  console.log(`  ${clave.padEnd(46)} ${String(n(cuantos)).padStart(7)}   ${pct.padStart(6)} %   ${String(ejemplos.get(clave)).slice(0, 46)}`);
}
db.close();
