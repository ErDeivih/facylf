#!/usr/bin/env node
/**
 * Vuelve a leer con el adaptador ACTUAL las páginas ya descargadas de un tipo, desde su evidencia (sin pedir
 * nada a la web), y guarda los registros y enlaces que salgan. Sirve cuando el adaptador aprende a leer más
 * cosas de una página que ya se tenía (p. ej. ServerSports, 02/10/2026: jugadores, goles y tarjetas de cada
 * ficha de partido, que antes sólo daba jornada y categoría).
 *
 *   node scripts/multideporte/reinterpreta.mjs --adaptador serversports --tipo partido [--max 100000]
 *
 * Escribe en la cola del adaptador: mejor con su recolector PARADO (SQLite lo aguanta, pero así no compiten).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { abreCola, encola, guardaRegistro } from './motor.mjs';
import { buscaEvidencia } from './archivo.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..', '..');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const nombre = arg('adaptador'), tipo = arg('tipo'), max = Number(arg('max', 1e9));
const ruta = join(AQUI, 'adaptadores', `${nombre}.mjs`);
if (!nombre || !tipo || !existsSync(ruta)) { console.error('Uso: reinterpreta.mjs --adaptador <nombre> --tipo <tipo> [--max N]'); process.exit(2); }
const adaptador = (await import(pathToFileURL(ruta).href)).default;
const lector = adaptador.tipos[tipo];
if (!lector) { console.error(`El adaptador ${nombre} no tiene el tipo ${tipo}`); process.exit(2); }
const dir = join(RAIZ, 'descargas-multideporte', adaptador.nombre);
const db = abreCola(join(dir, 'cola.sqlite'));
const paginas = db.prepare(`select clave, url, contexto, evidencia from paginas where adaptador=? and tipo=? and evidencia is not null
  and estado in ('hecha','pendiente') limit ?`).all(adaptador.nombre, tipo, max);
const cuenta = { paginas: paginas.length, leidas: 0, sinEvidencia: 0, errores: 0, registros: 0, enlaces: 0 };
for (const p of paginas) {
  const f = buscaEvidencia(adaptador.nombre, p.evidencia);   // raíz nueva (archivo.json) o la de siempre
  if (!f) { cuenta.sinEvidencia += 1; continue; }
  try {
    // La evidencia se guardó ya como UTF-8 (el motor decodifica antes de guardar).
    const bruto = gunzipSync(readFileSync(f));
    const html = bruto.toString('utf8');
    const res = lector.interpreta(html, { url: p.url, contexto: p.contexto ? JSON.parse(p.contexto) : null, bruto }) ?? {};
    db.exec('begin');
    for (const r of res.registros ?? []) { guardaRegistro(db, adaptador.nombre, r, p.url); cuenta.registros += 1; }
    for (const e of res.enlaces ?? []) { encola(db, adaptador.nombre, e); cuenta.enlaces += 1; }
    db.exec('commit');
    cuenta.leidas += 1;
  } catch (e) {
    try { db.exec('rollback'); } catch {}
    cuenta.errores += 1;
    if (cuenta.errores <= 5) console.error(`  ${p.url}: ${e?.message ?? e}`);
  }
}
db.close();
console.log(JSON.stringify(cuenta));
