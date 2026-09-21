#!/usr/bin/env node
/** SÓLO LECTURA: por qué un grupo detiene su lote en la importación. */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', join(resolve(import.meta.dirname, '..'), 'pruebas', 'reconstruccion', 'ciclo')));
const comp = arg('competicion');
const grupo = arg('grupo');
const db = new DatabaseSync(join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

console.log('actas por estado/calidad:');
for (const r of db.prepare('select estado, calidad, count(*) n from actas where competicion=? and grupo=? group by 1,2').all(comp, grupo)) {
  console.log(`  ${JSON.stringify(r)}`);
}
console.log('incidencias de las actas:');
for (const r of db.prepare('select incidencias, count(*) n from actas where competicion=? and grupo=? group by 1').all(comp, grupo)) {
  console.log(`  ${JSON.stringify(r).slice(0, 200)}`);
}
console.log(`participaciones: ${db.prepare('select count(*) n from participaciones where competicion=? and grupo=?').get(comp, grupo).n}`);
console.log('participaciones por lado:', JSON.stringify(db.prepare('select lado, count(*) n from participaciones where competicion=? and grupo=? group by 1').all(comp, grupo)));
console.log('participaciones por condicion:', JSON.stringify(db.prepare('select condicion, count(*) n from participaciones where competicion=? and grupo=? group by 1').all(comp, grupo)));
const acta = db.prepare('select codigo, datos from actas where competicion=? and grupo=? limit 1').get(comp, grupo);
console.log(`acta ${acta?.codigo} datos (300): ${String(acta?.datos).slice(0, 300)}`);
db.close();
