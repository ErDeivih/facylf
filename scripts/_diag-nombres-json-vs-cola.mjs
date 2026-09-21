#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿casan los nombres de equipo del `clasificacion.json` con los de la cola?
 *
 * Es lo que decide si la resolución de la tabla oficial puede ser por nombre cuando el JSON no trae
 * código (que es el caso de Cataluña: 0 de 3.909 filas con código). Se compara el literal exacto y el
 * normalizado igual que lo hará la base (`core.normaliza_nombre`, aproximado aquí en JavaScript).
 *
 * Uso: node scripts/_diag-nombres-json-vs-cola.mjs [grupo ...]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const raiz = resolve(import.meta.dirname, '..');
/** Misma idea que `core.normaliza_nombre`: sin tildes, sin signos, minúsculas, espacios colapsados. */
const normaliza = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Los grupos que se van a importar, más una muestra de Madrid y Valencia (que sí traen código). */
const objetivos = process.argv.slice(2);
const casos = objetivos.length ? [] : [
  { federacion: 'cataluna', temporada: '21', etiqueta: '2025-26', competicion: '54322932', grupo: '54322933' },
  { federacion: 'cataluna', temporada: '21', etiqueta: '2025-26', competicion: '54322932', grupo: '54322935' },
  { federacion: 'cataluna', temporada: '22', etiqueta: '2026-27', competicion: '58162422', grupo: '58315186' },
  { federacion: 'madrid', temporada: '25', etiqueta: '2025-26', competicion: '24037453', grupo: '24037455' },
  { federacion: 'valencia', temporada: '20', etiqueta: '2023-24', competicion: '900436016', grupo: '900436017' },
];
for (const g of objetivos) {
  const [federacion, temporada, etiqueta, competicion, grupo] = g.split('|');
  casos.push({ federacion, temporada, etiqueta, competicion, grupo });
}

for (const c of casos) {
  const carpeta = c.federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${c.federacion}`;
  const cola = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
  const json = join(raiz, carpeta, 'recolector-local', `t${c.temporada}-${c.etiqueta}`, `comp-${c.competicion}`, `grupo-${c.grupo}`, 'clasificacion.json');
  console.log(`\n================ ${c.federacion} · t${c.etiqueta} · c${c.competicion} · g${c.grupo} ================`);
  if (!existsSync(json)) { console.log(`  no existe ${json.replace(raiz, '')}`); continue; }
  if (!existsSync(cola)) { console.log(`  no existe la cola ${cola.replace(raiz, '')}`); continue; }
  const tabla = JSON.parse(readFileSync(json, 'utf8'));
  const db = new DatabaseSync(cola, { readOnly: true });
  const equipos = db.prepare('select codigo, nombre from equipos where temporada = ? and codigo in (select equipo_local_codigo from partidos where temporada=? and competicion=? and grupo=? union select equipo_visitante_codigo from partidos where temporada=? and competicion=? and grupo=?)')
    .all(c.temporada, c.temporada, c.competicion, c.grupo, c.temporada, c.competicion, c.grupo);
  const nombrePorCodigo = new Map(equipos.map((e) => [String(e.codigo), e.nombre]));
  const codigoPorNombre = new Map(equipos.map((e) => [e.nombre, e.codigo]));
  const porNorm = new Map();
  const ambiguos = new Set();
  for (const e of equipos) {
    const n = normaliza(e.nombre);
    if (porNorm.has(n) && porNorm.get(n) !== e.codigo) ambiguos.add(n);
    porNorm.set(n, e.codigo);
  }
  for (const n of ambiguos) porNorm.delete(n);
  console.log(`  cola: ${equipos.length} equipos · json: ${tabla.length} filas`);
  let exacto = 0, porNormalizado = 0, porCodigo = 0, sinResolver = 0;
  const fallos = [];
  for (const fila of tabla) {
    if (fila.equipoCodigo !== null && fila.equipoCodigo !== undefined && nombrePorCodigo.has(String(fila.equipoCodigo))) { porCodigo++; continue; }
    if (codigoPorNombre.has(fila.equipo)) { exacto++; continue; }
    if (porNorm.has(normaliza(fila.equipo))) { porNormalizado++; continue; }
    sinResolver++;
    if (fallos.length < 8) fallos.push(`«${fila.equipo}» (norm «${normaliza(fila.equipo)}»)`);
  }
  console.log(`  resueltos: por código ${porCodigo} · literal exacto ${exacto} · normalizado ${porNormalizado} · SIN RESOLVER ${sinResolver}`);
  if (ambiguos.size) console.log(`  nombres ambiguos en la cola (quedan fuera): ${[...ambiguos].slice(0, 5).join(' | ')}`);
  if (fallos.length) {
    console.log(`  ejemplos sin resolver:`);
    for (const f of fallos) console.log(`      ${f}`);
    console.log(`  muestra de nombres de la cola: ${equipos.slice(0, 6).map((e) => `«${e.nombre}»`).join(' · ')}`);
  }
  db.close();
}
