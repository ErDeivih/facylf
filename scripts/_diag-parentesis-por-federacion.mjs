#!/usr/bin/env node
/** SÓLO LECTURA: cuántas veces aparece cada paréntesis dudoso en TODAS las colas, por federación. */
import { createRequire } from 'node:module';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');
const TOKENS = ['(P)', '(RET)', '(Juv.)', '(Femenino)', '(VETERANOS)', '(C)', '(D)'];

const filas = [];
for (const d of readdirSync(raiz)) {
  if (!d.startsWith('descargas-')) continue;
  const p = join(raiz, d, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) continue;
  const federacion = d.replace(/^descargas-/, '');
  const db = new DatabaseSync(p, { readOnly: true });
  const cuenta = {};
  for (const t of TOKENS) {
    cuenta[t] = db.prepare(`select count(*) n from partidos
      where local like '%' || ? || '%' or visitante like '%' || ? || '%'`).get(t, t).n;
  }
  db.close();
  filas.push({ federacion, ...cuenta });
}
const anchos = [22, ...TOKENS.map(() => 8)];
const linea = (c) => c.map((v, i) => String(v).padEnd(anchos[i])).join('');
console.log(linea(['federación', ...TOKENS]));
for (const f of filas) console.log(linea([f.federacion, ...TOKENS.map((t) => f[t])]));
console.log('');
for (const t of TOKENS) {
  const total = filas.reduce((a, f) => a + f[t], 0);
  const donde = filas.filter((f) => f[t] > 0).map((f) => f.federacion);
  console.log(`${t.padEnd(12)} total ${String(total).padStart(5)} · federaciones: ${donde.length ? donde.join(', ') : '(ninguna)'}`);
}
