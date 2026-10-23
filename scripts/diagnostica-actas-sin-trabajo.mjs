/*
 * ── ACTAS IDENTIFICADAS QUE NO TIENEN NINGÚN TRABAJO QUE LAS PIDA ───────────────────────────────────────
 *
 * Una acta `pendiente` en la tabla `actas` no se descarga sola: hace falta su fila en `trabajos` (tipo `acta`) que
 * la pida. Si esa fila no existe o está en un estado que el selector no elige, el porcentaje de la temporada se
 * queda clavado y **nada lo avisa**: la acta está contada como pendiente, pero no hay forma de ir a por ella.
 *
 * Esto salió al medir Castilla y León el 29/09/2026: la 2022-23 tenía 17.374 actas pendientes y sólo 11.531
 * trabajos de TODOS los tipos. La cuenta no puede salir si cada acta pendiente tuviera su trabajo, así que hay
 * que saber cuántas faltan de verdad antes de dar por bueno que «el recolector las hará».
 *
 * Uso:  node scripts/diagnostica-actas-sin-trabajo.mjs <cola.sqlite> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta = ruta] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) {
  console.error('uso: node scripts/diagnostica-actas-sin-trabajo.mjs <cola.sqlite> [etiqueta]');
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true });
const nombres = new Map();
for (const t of db.prepare('select codigo, etiqueta from temporadas').all()) {
  nombres.set(String(t.codigo).trim(), String(t.etiqueta).trim());
}
const nombre = (t) => nombres.get(String(t).trim()) ?? `t${t}`;

/*
 * El emparejamiento es por (temporada, competicion, grupo, jornada, codigo): es la clave real de una acta, y
 * comparar sólo el código daría falsos negativos en cuanto dos grupos repitieran el código de una ficha.
 */
console.log(`\n════════ ${etiqueta} ════════`);
console.log('temporada    pendientes   con trabajo   SIN trabajo   estados de esos trabajos');

const filas = db.prepare(`
  select a.temporada,
    count(*) pendientes,
    sum(case when t.clave is not null then 1 else 0 end) conTrabajo
  from actas a
  left join trabajos t on t.tipo = 'acta'
    and t.temporada = a.temporada and t.competicion = a.competicion
    and t.grupo = a.grupo and t.jornada = a.jornada and t.acta = a.codigo
  where a.estado = 'pendiente'
  group by a.temporada
  order by cast(a.temporada as integer) desc`).all();

let tPend = 0;
let tSin = 0;
for (const f of filas) {
  const sin = Number(f.pendientes) - Number(f.conTrabajo);
  tPend += Number(f.pendientes);
  tSin += sin;
  const estados = db.prepare(`
    select t.estado, count(*) n
    from actas a join trabajos t on t.tipo = 'acta'
      and t.temporada = a.temporada and t.competicion = a.competicion
      and t.grupo = a.grupo and t.jornada = a.jornada and t.acta = a.codigo
    where a.estado = 'pendiente' and a.temporada = ?
    group by t.estado order by n desc`).all(f.temporada)
    .map((e) => `${e.estado}:${e.n}`).join(' ');
  console.log(`${nombre(f.temporada).padEnd(11)} ${String(f.pendientes).padStart(11)} ${String(f.conTrabajo).padStart(13)} ` +
    `${String(sin).padStart(13)}   ${estados || '(ninguno)'}`);
}

console.log(`\n  TOTAL: ${tPend} actas pendientes · ${tSin} de ellas SIN NINGÚN trabajo que las pida`);
db.close();
