/* Diagnóstico puntual: minutos con y sin peticiones en una cola, para ver huecos. Uso interno. */
import { DatabaseSync } from 'node:sqlite';
const [ruta, minutos = '90'] = process.argv.slice(2);
const db = new DatabaseSync(ruta, { readOnly: true });
const filas = db.prepare(`select strftime('%H:%M', iniciada_en) m, count(*) n
  from peticiones where datetime(iniciada_en) >= datetime('now', ?) group by 1 order by 1`)
  .all(`-${minutos} minutes`);
const ultima = db.prepare('select max(iniciada_en) u from peticiones').get().u;
console.log(`ultima peticion: ${ultima}   (ahora UTC: ${new Date().toISOString()})`);
console.log(filas.map((f) => `${f.m}:${f.n}`).join('  ') || '(sin peticiones)');
db.close();
