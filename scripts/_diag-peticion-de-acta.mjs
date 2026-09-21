#!/usr/bin/env node
/** Tamaño que registró la descarga original de unas actas concretas. */
import { DatabaseSync } from 'node:sqlite';

const rutaDb = process.argv[2];
const codigos = process.argv.slice(3);
const db = new DatabaseSync(rutaDb, { readOnly: true });
for (const codigo of codigos) {
  const filas = db.prepare(`select trabajo, url, iniciada_en, duracion_ms, resultado, detalle
    from peticiones where trabajo like ? order by id desc limit 3`).all(`acta|%|%|%|%|${codigo}`);
  console.log(`== ${codigo}`);
  for (const f of filas) console.log(`   ${f.iniciada_en} · ${f.resultado} · ${f.duracion_ms} ms · ${f.detalle}`);
  if (!filas.length) console.log('   sin peticiones registradas');
}
db.close();
