#!/usr/bin/env node
/** Compara la clave del trabajo con la fila de `actas` para una acta concreta. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
for (const codigo of process.argv.slice(2)) {
  const t = db.prepare(`select clave,temporada,competicion,grupo,jornada,acta,estado,intentos from trabajos
    where tipo='acta' and acta=?`).get(codigo);
  const a = db.prepare(`select codigo,temporada,competicion,grupo,jornada,estado,archivo from actas
    where codigo=?`).all(codigo);
  console.log(`acta ${codigo}`);
  console.log(`  trabajo: ${JSON.stringify(t)}`);
  console.log(`  actas:   ${JSON.stringify(a)}`);
}
db.close();
