/* Comprobación puntual: ¿cada federación del PC guarda actas nuevas o sólo hace peticiones? Uso interno. */
import { DatabaseSync } from 'node:sqlite';
const colas = [
  ['castilla-leon', 'descargas-federacion/recolector-local/cola-v2.sqlite'],
  ['madrid', 'descargas-madrid/recolector-local/cola-v2.sqlite'],
  ['valencia', 'descargas-valencia/recolector-local/cola-v2.sqlite'],
  ['cataluna', 'descargas-cataluna/recolector-local/cola-v2.sqlite'],
];
console.log('federacion      actas totales   ultima acta guardada        peticiones 24h   actas 24h');
for (const [nombre, ruta] of colas) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  const total = db.prepare('select count(*) n from actas').get().n;
  const ultima = db.prepare('select max(comprobada_en) u from actas').get().u ?? '-';
  const pet = db.prepare("select count(*) n from peticiones where datetime(iniciada_en) >= datetime('now','-24 hours')").get().n;
  const act = db.prepare("select count(*) n from actas where datetime(comprobada_en) >= datetime('now','-24 hours')").get().n;
  const estados = db.prepare('select estado, count(*) n from actas group by 1 order by n desc').all()
    .map((e) => `${e.estado}:${e.n}`).join(' ');
  console.log(`${nombre.padEnd(15)} ${String(total).padStart(13)}   ${ultima.padEnd(26)} ${String(pet).padStart(14)} ${String(act).padStart(10)}   ${estados}`);
  db.close();
}
