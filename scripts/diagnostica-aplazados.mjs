/*
 * ── ¿QUIÉN APARCÓ ESTO, Y CUÁNDO VUELVE? ─────────────────────────────────────────────────────────────────
 *
 * El 06/10/2026 apareció que doce federaciones del servidor tienen ~230.000 trabajos aplazados y CERO
 * pendientes: no están sin trabajo, están citados a fechas fijas (10 y 11 de octubre, 06:00). El carril de
 * descubrimiento no las despierta porque sólo ordena lo que está pendiente, y no hay nada pendiente.
 *
 * Esta consulta desglosa los aplazados por FECHA y por TIPO, y luego por TEMPORADA. Con eso se distingue:
 *
 *   · una ESCALERA DE ESPERA (48 h → 4 d → 8 d → 14 d del aplazamiento por «sin publicar»), que daría fechas
 *     escalonadas y no una sola;
 *   · un APARCADO DELIBERADO, que daría un montón de trabajos en una fecha lejana y siempre la misma;
 *   · y si afecta por igual a la temporada en curso y a las de 2010-2019, o sólo a las viejas.
 *
 * Imprime texto, para leerlo directamente. SÓLO LEE.
 *
 * Uso:  node scripts/diagnostica-aplazados.mjs <cola.sqlite> [etiqueta]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const [ruta, etiqueta] = process.argv.slice(2);
if (!ruta || !existsSync(ruta)) {
  console.log(`no encuentro la cola: ${ruta}`);
  process.exit(2);
}
const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
const ahora = new Date().toISOString();

console.log(`\n════════ ${etiqueta ?? ruta} ════════`);

const total = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado')`).get().n;
const aplaz = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento > ?`).get(ahora).n;
console.log(`  aplazados: ${aplaz} de ${total} pendientes  (${total > 0 ? Math.round((100 * aplaz) / total) : 0} %)`);

console.log('\n  POR FECHA (cuándo vuelven) — las 12 fechas con más trabajos');
for (const f of db.prepare(`
  select date(siguiente_intento) d, count(*) n, group_concat(distinct tipo) tipos
  from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento > ?
  group by 1 order by n desc limit 12`).all(ahora)) {
  console.log(`    ${f.d}  ${String(f.n).padStart(7)}   ${f.tipos}`);
}

console.log('\n  POR TIPO');
for (const f of db.prepare(`
  select tipo, count(*) n from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento > ?
  group by 1 order by n desc`).all(ahora)) {
  console.log(`    ${String(f.tipo).padEnd(20)} ${String(f.n).padStart(7)}`);
}

console.log('\n  POR TEMPORADA (aplazados / total de esa temporada)');
for (const f of db.prepare(`
  select temporada,
    sum(case when siguiente_intento > ? then 1 else 0 end) aplaz,
    count(*) total,
    min(date(siguiente_intento)) primera,
    max(date(siguiente_intento)) ultima
  from trabajos where estado in ('pendiente','bloqueado')
  group by 1 order by cast(temporada as integer) desc`).all(ahora)) {
  console.log(`    ${String(f.temporada).padStart(3)}  ${String(f.aplaz).padStart(7)} / ${String(f.total).padStart(7)}   ${f.primera ?? '-'} … ${f.ultima ?? '-'}`);
}

console.log('\n  LOS 5 APLAZADOS MÁS LEJANOS (el caso extremo, con su error si lo tiene)');
for (const f of db.prepare(`
  select clave, tipo, temporada, date(siguiente_intento) d, substr(coalesce(ultimo_error,'(sin error)'),1,70) e
  from trabajos where estado in ('pendiente','bloqueado') and siguiente_intento is not null
  order by siguiente_intento desc limit 5`).all()) {
  console.log(`    ${f.d}  ${f.tipo} t${f.temporada}  ${f.clave}`);
  console.log(`        ${f.e}`);
}
db.close();
