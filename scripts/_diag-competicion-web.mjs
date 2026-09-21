#!/usr/bin/env node
/** ¿La competición atrapada tiene además los grupos comprobados (condición de la web)? */
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const [federacion, temporada, competicion] = process.argv.slice(2);
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const c = db.prepare(`select codigo, nombre, grupos_comprobados_en from competiciones
  where temporada=? and codigo=?`).get(temporada, competicion);
console.log(JSON.stringify(c, null, 1));
if (!c?.grupos_comprobados_en) {
  console.log('→ sin `grupos_comprobados_en`: la web no la publica todavía por esa condición, no por las actas.');
}
console.log('grupos:', JSON.stringify(db.prepare(`select codigo, nombre, estado, jornadas from grupos
  where temporada=? and competicion=?`).all(temporada, competicion)));
db.close();
