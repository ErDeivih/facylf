#!/usr/bin/env node
/**
 * Enseña el trozo de HTML alrededor de una marca (para ver si una sección está vacía o si usa una
 * maquetación que no entendemos).
 *
 * Uso: node scripts/_diag-fragmento.mjs <federacion> <codigo-acta> <marca> [caracteres]
 */
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo } from './lib/recolector-local.mjs';

const [fed, codigo, marca, cuantos = '1800'] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const archivo = db.prepare(`select archivo from actas where codigo=?`).get(codigo)?.archivo;
db.close();
const html = leeArchivo(archivo)?.toString('utf8') ?? '';
const i = html.indexOf(marca);
console.log(`marca "${marca}" en posición ${i} de ${html.length} caracteres`);
if (i < 0) process.exit(0);
const desde = Math.max(0, i - 400);
const trozo = html.slice(desde, desde + Number(cuantos));
console.log(trozo.replace(/\n\s*\n/g, '\n'));
