#!/usr/bin/env node
/*
 * cuenta-descansos.mjs — SÓLO LEE un paquete SQLite de _traspaso.
 *
 * Para qué: la regla de verificación de la Fase 3 es
 *     canónico == paquete − filas imposibles − filas de descanso
 * Las imposibles salen con `mira-lote.mjs --avisos`, pero **los descansos no dejan aviso**:
 * hay que contarlos en el paquete.
 *
 * Cómo: mira **todas** las columnas de la tabla de partidos (no sólo las de equipo, porque los
 * códigos no llevan el texto) y cuenta las filas donde alguna columna casa con el texto.
 *
 * Uso:  node pruebas/reconstruccion/cuenta-descansos.mjs <paquete.sqlite> [texto]
 *       (texto por defecto: "descans")
 */
import { DatabaseSync } from 'node:sqlite';

const [ruta, texto = 'descans'] = process.argv.slice(2);
if (!ruta) { console.error('Falta el paquete.'); process.exit(2); }

const d = new DatabaseSync(ruta, { readOnly: true });
const tablas = d.prepare("select name from sqlite_master where type='table'").all().map((r) => r.name);
const t = tablas.find((x) => /^partido/i.test(x));
if (!t) { console.error(`Sin tabla de partidos. Tablas: ${tablas.join(', ')}`); process.exit(1); }

const cols = d.prepare(`pragma table_info(${t})`).all().map((c) => c.name);
const re = new RegExp(texto, 'i');
const filas = d.prepare(`select * from ${t}`).all();

let n = 0;
const vistos = new Map();
const porColumna = new Map();

for (const f of filas) {
  let hit = null;
  for (const k of cols) {
    const v = f[k];
    if (v == null) continue;
    if (re.test(String(v))) { hit = { k, v: String(v) }; break; }
  }
  if (hit) {
    n++;
    porColumna.set(hit.k, (porColumna.get(hit.k) ?? 0) + 1);
    vistos.set(hit.v, (vistos.get(hit.v) ?? 0) + 1);
  }
}

console.log(`${ruta}`);
console.log(`  tabla ${t} · ${cols.length} columnas · partidos ${filas.length} · descansos (/${texto}/i) ${n}`);
console.log(`  columnas que casan: ${[...porColumna].map(([k, c]) => `${k} ${c}`).join(' · ') || '(ninguna)'}`);
for (const [k, c] of [...vistos].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${String(c).padStart(5)}  «${k}»`);
d.close();
