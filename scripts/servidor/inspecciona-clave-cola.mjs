/*
 * inspecciona-clave-cola.mjs — por qué una misma dirección se reintenta en bucle
 *
 * ── EL SÍNTOMA QUE LO MOTIVA ────────────────────────────────────────────────────────────────────────────
 *
 * Madrid pidió en tres minutos CINCO veces la misma acta (`acta|19|17145676|17145685|1|501045`) y las
 * cinco veces agotó el tiempo de espera, mientras 7.108 actas esperaban turno. El código dice que un
 * error que no es bloqueo deja el trabajo `pendiente` con `siguiente_intento` a 2 h (primer intento) o
 * 24 h (segundo), así que volver a verlo a los 45 s significa que la fila que se actualiza NO es la
 * fila que se elige. La sospecha concreta es que haya VARIAS filas con la misma `clave` en `trabajos`:
 * `marcaTrabajo` actualiza por `clave` (afecta a todas), pero el `select` del bucle devuelve una sola,
 * y si `clave` no tiene un índice único las copias pueden convivir y turnarse.
 *
 * Este script responde con datos, no con teoría:
 *   1. Cuántas filas hay por clave duplicada y cuánta prioridad consumen.
 *   2. El estado REAL (estado, intentos, siguiente_intento, ultimo_error) de una clave concreta.
 *   3. Si existe un índice único sobre `clave`.
 *
 * SÓLO LEE: abre la cola en readOnly.
 *
 * Uso:
 *   docker exec facylf-monitor node /app/scripts/servidor/inspecciona-clave-cola.mjs <federación> [clave]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2];
const CLAVE = process.argv[3] ?? null;
if (!FEDERACION) {
  console.error('uso: inspecciona-clave-cola.mjs <federación> [clave]');
  process.exit(2);
}

const n = (x) => Number(x ?? 0).toLocaleString('es-ES');

// La misma resolución de carpeta que usa el recolector: SSD si ya se migró, HDD si no.
const candidatas = [
  join('/srv/ssd/facylf', `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite'),
  join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite'),
];
const ruta = candidatas.find((p) => existsSync(p));
if (!ruta) {
  console.error(`no encuentro la cola de ${FEDERACION}. Probado:\n  ${candidatas.join('\n  ')}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60_000 });
console.log(`══ ${FEDERACION} ══\ncola: ${ruta}\n`);

// ── 1. Índices de `trabajos`: ¿algo impide dos filas con la misma clave? ────────────────────────────────
console.log('── índices de `trabajos` ──');
const indices = db.prepare(`select name, sql from sqlite_master where type='index' and tbl_name='trabajos'`).all();
for (const i of indices) console.log(`  ${String(i.name).padEnd(34)} ${i.sql ?? '(implícito)'}`);
const unico = indices.some((i) => /unique/i.test(String(i.sql ?? '')) && /\(?\s*clave\s*\)?/i.test(String(i.sql ?? '')));
console.log(`  → ${unico ? 'HAY índice único sobre clave' : 'NO hay índice único sobre clave (las copias pueden convivir)'}`);

// ── 2. Filas por clave duplicada ────────────────────────────────────────────────────────────────────────
console.log('\n── claves con más de una fila ──');
const dup = db.prepare(`select clave, count(*) filas, group_concat(estado) estados,
    max(coalesce(intentos,0)) intentos, max(coalesce(prioridad,0)) prioridad
  from trabajos group by clave having filas > 1 order by filas desc limit 15`).all();
if (!dup.length) console.log('  ninguna: la clave es única de hecho en esta cola');
for (const d of dup) {
  console.log(`  ${String(d.filas).padStart(3)} filas  ${String(d.estados).slice(0, 44).padEnd(46)} int=${d.intentos} pri=${d.prioridad}  ${String(d.clave).slice(0, 70)}`);
}
const totalDup = db.prepare(`select coalesce(sum(filas - 1), 0) sobra from (
  select count(*) filas from trabajos group by clave having filas > 1)`).get()?.sobra ?? 0;
console.log(`  filas sobrantes por duplicidad: ${n(totalDup)}`);

// ── 3. Estado real de una clave concreta ────────────────────────────────────────────────────────────────
if (CLAVE) {
  console.log(`\n── la clave ${CLAVE} ──`);
  const filas = db.prepare(`select rowid, estado, intentos, prioridad, siguiente_intento, creado_en,
      actualizado_en, substr(coalesce(ultimo_error,''), 1, 70) err from trabajos where clave = ? order by rowid`)
    .all(CLAVE);
  if (!filas.length) console.log('  no existe esa clave');
  for (const f of filas) {
    console.log(`  rowid ${String(f.rowid).padStart(7)}  ${String(f.estado).padEnd(11)} int=${String(f.intentos).padStart(2)} pri=${String(f.prioridad).padStart(6)}`
      + `  sig=${f.siguiente_intento ?? 'null'}  act=${f.actualizado_en ?? 'null'}`);
    if (f.err) console.log(`        último error: ${f.err}`);
  }
}

// ── 4. Cuántas claves duplicadas son actas y cuánto trabajo disponible estorban ──────────────────────────
console.log('\n── duplicadas por tipo de trabajo ──');
const porTipo = db.prepare(`select substr(clave, 1, instr(clave || '|', '|') - 1) prefijo,
    count(*) claves_duplicadas, sum(filas) filas from (
      select clave, count(*) filas from trabajos group by clave having filas > 1)
    group by prefijo order by filas desc limit 10`).all();
if (!porTipo.length) console.log('  ninguna');
for (const p of porTipo) console.log(`  ${String(p.prefijo).padEnd(22)} ${n(p.claves_duplicadas).padStart(7)} claves  ${n(p.filas).padStart(8)} filas`);

db.close();
