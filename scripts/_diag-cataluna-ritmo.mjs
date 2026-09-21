#!/usr/bin/env node
/** Cuántas actas lleva Cataluña y cuándo fue la última petición. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const hechas = db.prepare(`select count(*) n from actas where estado='hecha'`).get().n;
const ultima = db.prepare('select iniciada_en, url from peticiones order by id desc limit 1').get();
const hace = Math.round((Date.now() - new Date(ultima.iniciada_en).getTime()) / 1000);
console.log(`Cataluña: ${hechas} actas hechas · última petición hace ${hace} s`);
console.log(`  ${ultima.url}`);
const porHora = db.prepare(`select count(*) n from peticiones where iniciada_en > ?`)
  .get(new Date(Date.now() - 3600_000).toISOString()).n;
console.log(`  peticiones en la última hora: ${porHora}`);
db.close();
