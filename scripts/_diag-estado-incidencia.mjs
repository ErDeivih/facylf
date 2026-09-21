#!/usr/bin/env node
/** Estado actual de las actas con una incidencia concreta (para saber si bloquean o no). */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, patron] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
for (const f of db.prepare(`select estado, calidad, count(*) n, min(temporada) tmin, max(temporada) tmax
  from actas where incidencias like ? group by estado, calidad order by n desc`).all(patron)) {
  console.log(`  estado=${f.estado} calidad=${f.calidad} · ${f.n} actas · temporadas ${f.tmin}-${f.tmax}`);
}
const trabajos = db.prepare(`select estado, count(*) n from trabajos where tipo='acta' and acta in
  (select codigo from actas where incidencias like ?) group by estado order by n desc`).all(patron);
console.log('  trabajos de esas actas:', trabajos.map((t) => `${t.estado}=${t.n}`).join(' · ') || 'ninguno');
db.close();
