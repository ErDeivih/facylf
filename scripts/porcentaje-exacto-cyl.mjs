/*
 * ── PORCENTAJE EXACTO DE CASTILLA Y LEÓN, TEMPORADA A TEMPORADA ────────────────────────────────────────
 *
 * Con el criterio que vale, después de que el responsable tumbara el mío: lo que mide el avance de una
 * temporada NO es «cuántos partidos tienen acta guardada» (eso da 96-98 % y engaña, porque sólo cuenta lo
 * descubierto), sino **cuántas actas están hechas de cuántas hay identificadas**. La tabla `actas` de la cola
 * lleva su propio estado: `hecha`, `pendiente`, `sin_datos`. De ahí sale el porcentaje honesto.
 *
 * Se dan las dos cifras juntas porque dicen cosas distintas:
 *   · **% de actas**      = hechas / (hechas + pendientes)
 *   · **% de trabajos**   = trabajos hechos / trabajos totales (incluye calendarios, clasificaciones e índices)
 *
 * Uso:  node scripts/porcentaje-exacto-cyl.mjs <cola.sqlite> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta = ruta] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) {
  console.error('uso: node scripts/porcentaje-exacto-cyl.mjs <cola.sqlite> [etiqueta]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true });
const nombres = new Map();
try {
  for (const t of db.prepare('select codigo, etiqueta from temporadas').all()) nombres.set(String(t.codigo).trim(), t.etiqueta);
} catch { /* sin tabla */ }

console.log(`\n════════ ${etiqueta} ════════`);
console.log('temporada    actas hechas   pendientes   sin datos   % ACTAS   trabajos   hechos   % TRABAJOS');

const temporadas = db.prepare(`select temporada, count(*) as n from trabajos group by 1 order by 1 desc`).all();
let tHechas = 0; let tPend = 0; let tSin = 0; let tTrab = 0; let tHech = 0;
for (const f of temporadas) {
  const t = f.temporada;
  const hechas = db.prepare(`select count(*) as n from actas where temporada = ? and estado = 'hecha'`).get(t).n;
  const pend = db.prepare(`select count(*) as n from actas where temporada = ? and estado = 'pendiente'`).get(t).n;
  const sin = db.prepare(`select count(*) as n from actas where temporada = ? and estado = 'sin_datos'`).get(t).n;
  const trab = db.prepare(`select count(*) as n from trabajos where temporada = ?`).get(t).n;
  const hech = db.prepare(`select count(*) as n from trabajos where temporada = ? and estado = 'hecho'`).get(t).n;
  const pctActas = (hechas + pend) > 0 ? Math.round((100 * hechas) / (hechas + pend)) : null;
  const pctTrab = trab > 0 ? Math.round((100 * hech) / trab) : 0;
  tHechas += Number(hechas); tPend += Number(pend); tSin += Number(sin); tTrab += Number(trab); tHech += Number(hech);
  const nombre = nombres.get(String(t).trim()) ?? `t${t}`;
  console.log(`${String(nombre).padEnd(11)} ${String(hechas).padStart(12)} ${String(pend).padStart(12)} ${String(sin).padStart(11)} ${String(pctActas === null ? '—' : pctActas + ' %').padStart(8)} ${String(trab).padStart(10)} ${String(hech).padStart(8)} ${String(pctTrab + ' %').padStart(11)}`);
}

const pctActasTotal = (tHechas + tPend) > 0 ? Math.round((100 * tHechas) / (tHechas + tPend)) : 0;
const pctTrabTotal = tTrab > 0 ? Math.round((100 * tHech) / tTrab) : 0;
console.log(`\n  TOTAL: ${tHechas} actas hechas de ${tHechas + tPend} identificadas → ${pctActasTotal} %`);
console.log(`         ${tPend} actas pendientes y ${tSin} sin datos`);
console.log(`         trabajos hechos: ${tHech} de ${tTrab} → ${pctTrabTotal} %`);
db.close();
