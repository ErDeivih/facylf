// Volcado de una fila concreta de `partidos` en varias SQLite, con TODAS sus columnas, para poder fechar
// quién escribió qué. Sin esto, atribuir una diferencia de huella es adivinar.
import { DatabaseSync } from 'node:sqlite';

const [temporada, competicion, grupo, jornada, orden, ...rutas] = process.argv.slice(2);
if (rutas.length < 2) {
  console.error('uso: node scripts/_diag-fila-cola.mjs <temp> <comp> <grupo> <jornada> <orden> <a.sqlite> <b.sqlite> ...');
  process.exit(2);
}

for (const ruta of rutas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    console.log(`\n=== ${ruta}`);
    const filas = db.prepare(`select * from partidos where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
      .all(temporada, competicion, grupo, jornada, orden);
    if (!filas.length) { console.log('  (esa fila no existe aquí)'); }
    for (const f of filas) {
      for (const [k, v] of Object.entries(f)) console.log(`  ${k.padEnd(26)} ${v === null ? '·null·' : JSON.stringify(v)}`);
    }
    const j = db.prepare(`select * from jornadas where temporada=? and competicion=? and grupo=? and numero=?`)
      .all(temporada, competicion, grupo, jornada);
    console.log(`  -- jornada (${j.length} fila/s)`);
    for (const f of j) {
      for (const [k, v] of Object.entries(f)) console.log(`     ${k.padEnd(22)} ${v === null ? '·null·' : JSON.stringify(v)}`);
    }
    const t = db.prepare(`select count(*) n, max(actualizado_en) ultimo from partidos`).get();
    console.log(`  -- partidos: ${t.n} filas · último sello ${t.ultimo}`);
  } finally { db.close(); }
}
