#!/usr/bin/env node
/** Guarda una página (GET) sin DNI ni correos en descargas-sondeo-multideporte/paginas/<archivo> para estudiarla.
 *  Uso: node guarda-pagina.mjs <url> <archivo> [cuerpo POST] */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pedirHttp, retiraIdentificadores } from './motor.mjs';
const [url, archivo, cuerpo] = process.argv.slice(2);
const dir = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'), 'descargas-sondeo-multideporte', 'paginas');
mkdirSync(dir, { recursive: true });
const r = await pedirHttp(url, { cuerpo: cuerpo ?? null });
writeFileSync(join(dir, archivo), retiraIdentificadores(r.bruto.toString('utf8')));
console.log(r.estado, url, '→', archivo, r.bruto.length, 'B');
