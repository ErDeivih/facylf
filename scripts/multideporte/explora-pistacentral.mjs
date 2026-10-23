#!/usr/bin/env node
/**
 * Exploración de Pista Central (FTCV, ftcv.pistacentral.es → API pistacentral.com.es/apiPistacentral/):
 * lista de torneos de una fecha → ficha (getOne) e info de dos torneos ya jugados. 5-8 s entre peticiones.
 * Sólo los GET públicos que usa la web sin sesión. Guarda SIN DNI/correos en
 * descargas-sondeo-multideporte/pistacentral/<db>/.
 * Uso: node scripts/multideporte/explora-pistacentral.mjs ftcv 2026-06-01
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retiraIdentificadores, AGENTE } from './motor.mjs';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://pistacentral.com.es/apiPistacentral/';
const [db = 'ftcv', fecha = '2026-06-01'] = process.argv.slice(2);
const dir = join(RAIZ, 'descargas-sondeo-multideporte', 'pistacentral', db);
mkdirSync(dir, { recursive: true });
const espera = () => new Promise((r) => setTimeout(r, 5000 + Math.random() * 3000));
let n = 0;
async function get(ruta, etiqueta) {
  if (n++) await espera();
  const r = await fetch(API + ruta, { headers: { 'user-agent': AGENTE, accept: 'application/json' } });
  const t = retiraIdentificadores(await r.text());
  writeFileSync(join(dir, `${String(n).padStart(2, '0')}-${etiqueta}.json`), t);
  let j = null; try { j = JSON.parse(t); } catch {}
  const cuerpo = Array.isArray(j) ? `[${j.length}] ${j[0] ? Object.keys(j[0]).join(',') : ''}` : j ? Object.entries(j).map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '{…}' : JSON.stringify(v).slice(0, 30)}`).join(' ') : t.slice(0, 200);
  console.log(`${etiqueta} ${r.status} ${t.length} B · ${cuerpo}`);
  return j;
}
const lista = await get(`web/torneos/${db}/${fecha}/ALL/ALL/1`, `lista-${fecha}`);
const torneos = Array.isArray(lista) ? lista : lista?.torneos ?? lista?.data ?? lista?.content ?? [];
for (const t of torneos.slice(0, 2)) {
  const id = t.id ?? t.idTorneo ?? t.codigo;
  const uno = await get(`web/torneos/${db}/${id}`, `torneo-${id}`);
  if (uno && !Array.isArray(uno)) for (const [k, v] of Object.entries(uno)) if (Array.isArray(v) && v[0] && typeof v[0] === 'object') console.log(`  ${k}[0]: ${Object.keys(v[0]).join(',')}`);
  await get(`web/torneos/info/${db}/${id}`, `info-${id}`);
}
console.log(`${n} peticiones → ${dir}`);
