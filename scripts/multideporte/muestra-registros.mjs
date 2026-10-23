#!/usr/bin/env node
/** Muestra unos registros de un adaptador (para comprobar una prueba). Uso: muestra-registros.mjs <adaptador> <tipo> [n] */
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { abreCola } from './motor.mjs';
const [ad, tipo, n = 5] = process.argv.slice(2);
const db = abreCola(join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'descargas-multideporte', ad, 'cola.sqlite'));
for (const r of db.prepare('select clave, datos from registros where adaptador=? and tipo=? order by rowid desc limit ?').all(ad, tipo, Number(n))) console.log(r.clave, r.datos.slice(0, 400));
console.log(db.prepare('select tipo, estado, count(*) n, max(ultimo_error) e from paginas where adaptador=? group by 1,2').all(ad));
