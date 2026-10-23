#!/usr/bin/env node
/** Muestra páginas de la cola de un adaptador (tipo, estado y contexto) para revisar una prueba.
 *  Uso: muestra-paginas.mjs <adaptador> [tipo] [n] */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abreCola } from './motor.mjs';
const [ad, tipoArg, n = 12] = process.argv.slice(2);
const tipo = tipoArg && tipoArg !== '-' ? tipoArg : null;
const db = abreCola(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'descargas-multideporte', ad, 'cola.sqlite'));
const filas = db.prepare(`select tipo, estado, contexto, ultimo_error from paginas where adaptador=? and (? is null or tipo=?)
  order by rowid desc limit ?`).all(ad, tipo, tipo, Number(n));
for (const f of filas) console.log(f.tipo, f.estado, String(f.contexto ?? '').slice(0, 300), f.ultimo_error ? `· ${f.ultimo_error.slice(0, 120)}` : '');
