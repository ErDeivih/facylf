#!/usr/bin/env node
/**
 * Limpia las fechas centinela ya guardadas (La Rioja publica 01-01-9999 en jornadas sin fecha).
 *
 *  El extractor ya no las acepta, pero las que se guardaron antes siguen en la base de datos y la web
 *  y los informes las mostraban como «última jornada prevista 9999-01-01». Se pone NULL, que es lo
 *  que significa: todavía no se sabe cuándo se juega.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const LIMITE = `${new Date().getFullYear() + 3}-12-31`;
let total = 0;
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-'))) {
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  try {
    const db = new DatabaseSync(ruta);
    const r = db.prepare('update jornadas set fecha=null where fecha is not null and fecha > ?').run(LIMITE);
    db.close();
    if (Number(r.changes ?? 0)) {
      console.log(`  ${dir}: ${r.changes} fechas imposibles puestas a desconocido`);
      total += Number(r.changes ?? 0);
    }
  } catch (error) {
    console.log(`  ${dir}: ${error.message}`);
  }
}
console.log(`total: ${total}`);
