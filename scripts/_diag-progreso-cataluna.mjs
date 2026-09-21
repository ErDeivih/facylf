#!/usr/bin/env node
/** Progreso de actas por competición de Cataluña: cuántas faltan para que un grupo se publique. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';

const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), 'descargas-cataluna',
  'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const filas = db.prepare(`select temporada, competicion, count(*) total,
  sum(case when estado='hecha' then 1 else 0 end) hechas,
  sum(case when estado not in ('hecha','ausente_web') then 1 else 0 end) pendientes
  from actas group by temporada, competicion order by pendientes`).all();
console.log('competiciones con actas registradas:');
for (const f of filas) {
  const nombre = db.prepare('select nombre from competiciones where temporada=? and codigo=?')
    .get(f.temporada, f.competicion)?.nombre ?? '?';
  const grupos = db.prepare(`select count(*) n, sum(case when jornadas is not null then 1 else 0 end) conIndice
    from grupos where temporada=? and competicion=?`).get(f.temporada, f.competicion);
  console.log(`  ${String(nombre).slice(0, 40).padEnd(42)} actas ${String(f.hechas).padStart(4)}/${String(f.total).padStart(4)}` +
    ` · pendientes ${String(f.pendientes).padStart(4)} · grupos ${grupos.n} (índice leído ${grupos.conIndice})`);
}
db.close();
