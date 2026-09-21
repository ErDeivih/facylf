#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿el `clasificacion.json` de un grupo es la tabla DE ESE grupo?
 *
 * Se compara el conjunto de nombres del JSON con el de cada grupo hermano de la misma competición. Si
 * la tabla del grupo N casa mejor con los equipos del grupo M, la página descargada no era la de este
 * grupo y escribirla daría una clasificación oficial falsa.
 *
 * Uso: node scripts/_diag-tabla-de-que-grupo.mjs <federacion> <temporada> <etiqueta> <competicion> <grupo...>
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const [federacion, temporada, etiqueta, competicion, ...grupos] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const cola = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(cola, { readOnly: true });

const normaliza = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Sin la letra de equipo final: «ARGENTONA, C.F. A» → «argentona c f». */
const sinLetra = (s) => normaliza(s).replace(/\s+[a-z]$/, '');

const equiposDe = (grupo) => db.prepare(`select distinct e.codigo, e.nombre from equipos e
   where e.temporada = ? and e.codigo in (
     select equipo_local_codigo from partidos where temporada=? and competicion=? and grupo=?
     union select equipo_visitante_codigo from partidos where temporada=? and competicion=? and grupo=?)`)
  .all(temporada, temporada, competicion, grupo, temporada, competicion, grupo);

const todos = grupos.length ? grupos : db.prepare(`select codigo from grupos where temporada=? and competicion=? order by codigo`)
  .all(temporada, competicion).map((g) => g.codigo);

const tablas = new Map();
for (const g of todos) {
  const ruta = join(raiz, carpeta, 'recolector-local', `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${g}`, 'clasificacion.json');
  if (!existsSync(ruta)) continue;
  try { tablas.set(g, JSON.parse(readFileSync(ruta, 'utf8'))); } catch { /* ilegible */ }
}
console.log(`grupos de la competición ${competicion}: ${todos.length} · con clasificacion.json legible: ${tablas.size}\n`);

for (const [g, tabla] of tablas) {
  const nombresJson = tabla.map((f) => f.equipo);
  const normJson = new Set(nombresJson.map(normaliza));
  const baseJson = new Set(nombresJson.map(sinLetra));
  console.log(`--- tabla del grupo ${g} (${nombresJson.length} filas) ---`);
  const filas = [];
  for (const otro of todos) {
    const equipos = equiposDe(otro);
    if (!equipos.length) continue;
    const normCola = equipos.map((e) => normaliza(e.nombre));
    const baseCola = new Set(equipos.map((e) => sinLetra(e.nombre)));
    const exactos = normCola.filter((n) => normJson.has(n)).length;
    const sinLetraComun = [...baseCola].filter((b) => baseJson.has(b)).length;
    filas.push({ otro, equipos: equipos.length, exactos, sinLetra: sinLetraComun });
  }
  filas.sort((a, b) => b.sinLetra - a.sinLetra);
  for (const f of filas.slice(0, 4)) {
    const marca = f.otro === g ? '' : '  ← MEJOR QUE EL SUYO';
    console.log(`    vs grupo ${f.otro}: ${f.exactos}/${f.equipos} nombres exactos · ${f.sinLetra}/${f.equipos} sin la letra final${marca}`);
  }
  // Nombres del JSON que no aparecen en el grupo al que dice pertenecer.
  const suyos = new Set(equiposDe(g).map((e) => normaliza(e.nombre)));
  const suyosBase = new Set(equiposDe(g).map((e) => sinLetra(e.nombre)));
  const huerfanos = nombresJson.filter((n) => !suyos.has(normaliza(n)));
  console.log(`    nombres del JSON que no están en la cola de ese grupo: ${huerfanos.length}`);
  for (const h of huerfanos.slice(0, 5)) {
    const base = sinLetra(h);
    const coincide = [...suyosBase].includes(base) ? '  (mismo club, letra distinta en la cola)' : '';
    console.log(`        «${h}»${coincide}`);
  }
}
db.close();
