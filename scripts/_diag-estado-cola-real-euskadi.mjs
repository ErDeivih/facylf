#!/usr/bin/env node
/** SÓLO LECTURA: estado de la cola REAL de Euskadi, para comprobar que sólo la han escrito los workers. */
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');
const ruta = join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true });
const uno = (sql) => db.prepare(sql).get().n;
const marcador = `local like '%(Sailkatua)%' or visitante like '%(Sailkatua)%'
  or local like '%(Irabazlea)%' or visitante like '%(Irabazlea)%'
  or local like '%(P)%' or visitante like '%(P)%'`;
console.log(`cola REAL de Euskadi · ${(statSync(ruta).size / 1048576).toFixed(1)} MB`);
console.log(`  partidos .................. ${uno('select count(*) n from partidos')}   (la copia prístina tenía 34358)`);
console.log(`  jornadas .................. ${uno('select count(*) n from jornadas')}   (la copia prístina tenía 4802 con archivo)`);
console.log(`  filas con marcador de estado ${uno(`select count(*) n from partidos where ${marcador}`)}   (la copia prístina tenía 209)`);
console.log(`  equipos con código ......... ${uno('select count(*) n from equipos')}`);
console.log(`  trabajos en_curso .......... ${uno("select count(*) n from trabajos where estado = 'en_curso'")}`);
console.log('  última escritura del fichero:', statSync(ruta).mtime.toISOString());
db.close();
