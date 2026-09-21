#!/usr/bin/env node
/**
 * Detalle de los grupos de una competición: los que consiguieron índice y los que no, con su
 * temporada, código, nombre y estado. Sirve para ver si el que falla es un duplicado del que funciona.
 *
 * Uso: node scripts/_diag-grupos-competicion.mjs <ruta-cola> <competicion> [competicion...]
 */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, ...competiciones] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
for (const competicion of competiciones) {
  const c = db.prepare(`select nombre from competiciones where codigo=? limit 1`).get(competicion);
  console.log(`\n===== c${competicion} ${c?.nombre ?? '?'}`);
  for (const g of db.prepare(`select temporada, codigo, nombre, estado, jornadas from grupos
    where competicion=? order by temporada desc, codigo`).all(competicion)) {
    const t = db.prepare(`select estado, intentos, ultimo_error, siguiente_intento from trabajos
      where tipo='indice_jornadas' and temporada=? and competicion=? and grupo=?`)
      .get(g.temporada, competicion, g.codigo);
    console.log(`  t${g.temporada} g${g.codigo} «${g.nombre}» estado=${g.estado} jornadas=${g.jornadas ?? '-'} · trabajo=${t ? `${t.estado} intentos=${t.intentos} sig=${t.siguiente_intento ?? '-'}` : 'sin trabajo'}`);
    if (t?.ultimo_error) console.log(`      error: ${t.ultimo_error.slice(0, 120)}`);
  }
}
db.close();
