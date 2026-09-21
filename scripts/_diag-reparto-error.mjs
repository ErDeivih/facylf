#!/usr/bin/env node
/** Reparto por temporada y competición de los trabajos bloqueados con un motivo concreto. */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, patron] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
console.log('-- por temporada --');
for (const f of db.prepare(`select temporada, count(*) n from trabajos where estado in ('pendiente','bloqueado')
  and ultimo_error like ? group by temporada order by cast(temporada as integer) desc`).all(patron)) {
  console.log(`  t${f.temporada}: ${f.n}`);
}
console.log('-- por competición (5 primeras) --');
for (const f of db.prepare(`select competicion, count(*) n from trabajos where estado in ('pendiente','bloqueado')
  and ultimo_error like ? group by competicion order by n desc limit 5`).all(patron)) {
  const nombre = db.prepare('select nombre from competiciones where codigo=?').get(f.competicion)?.nombre ?? '?';
  console.log(`  c${f.competicion} ${nombre}: ${f.n}`);
}
db.close();
