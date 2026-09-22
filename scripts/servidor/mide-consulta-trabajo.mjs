#!/usr/bin/env node
/*
 * ── ¿CUÁNTO CUESTA ELEGIR EL SIGUIENTE TRABAJO? ─────────────────────────────────────────────────────────
 *
 * `siguienteTrabajo()` se ejecuta UNA VEZ POR TRABAJO, dentro del bucle del recolector. Si esa consulta
 * cuesta segundos, el techo de cada federación no lo pone ni el portal ni la cortesía: lo pone nuestra
 * propia cola. Este programa la mide en vivo, en sólo lectura, contra la cola de una federación.
 *
 * Mide tres cosas y las separa, porque se arreglan de forma distinta:
 *   1. la consulta REAL de `siguienteTrabajo` (la que corre el recolector);
 *   2. el plan que elige SQLite para ella (`EXPLAIN QUERY PLAN`), para saber si usa índice o si ordena;
 *   3. dos consultas de control del ritmo (`peticionesHoy`, `ultimaPeticion`), que corren antes de CADA
 *      petición y también suman.
 *
 * Es de SÓLO LECTURA: abre la cola con `readOnly: true`. No escribe, no bloquea y no toca la flota.
 *
 * Uso (dentro de un contenedor; el host no tiene Node):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/mide-consulta-trabajo.mjs [federación] [repeticiones]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const REPETICIONES = Number(process.argv[3] ?? 20);
const TEMPORADA_MINIMA = process.env.FACYLF_TEMPORADA_MINIMA ?? '2023-24';

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}: ${ruta}`);
  process.exit(1);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
const ahora = () => new Date().toISOString();

/** Cronometra una función y devuelve los milisegundos que ha tardado. */
function cronometra(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

function estadistica(ms) {
  const o = [...ms].sort((a, b) => a - b);
  const media = o.reduce((a, b) => a + b, 0) / o.length;
  return {
    media,
    mediana: o[Math.floor(o.length / 2)],
    min: o[0],
    max: o[o.length - 1],
    suma: o.reduce((a, b) => a + b, 0),
  };
}

function formato(e) {
  return `${e.media.toFixed(1)} ms de media · mediana ${e.mediana.toFixed(1)} · min ${e.min.toFixed(1)} · max ${e.max.toFixed(1)}`;
}

console.log(`══ cola de ${FEDERACION} ══`);
const tamanoCola = db.prepare('select count(*) n from trabajos').get().n;
console.log(`  trabajos en la cola: ${tamanoCola.toLocaleString('es-ES')}`);
for (const f of db.prepare(`select estado, count(*) n from trabajos group by estado order by n desc`).all()) {
  console.log(`    ${String(f.estado).padEnd(12)} ${String(f.n).padStart(9)}`);
}
for (const f of db.prepare(`select tipo, count(*) n from trabajos
  where estado in ('pendiente','bloqueado') group by tipo order by n desc`).all()) {
  console.log(`    pendiente/bloqueado · ${String(f.tipo).padEnd(20)} ${String(f.n).padStart(9)}`);
}
console.log(`  filas en peticiones: ${Number(db.prepare('select count(*) n from peticiones').get().n).toLocaleString('es-ES')}`);
console.log(`  filas en archivos:   ${Number(db.prepare('select count(*) n from archivos').get().n).toLocaleString('es-ES')}`);

/*
 * ── LA CONSULTA REAL, COPIADA PALABRA POR PALABRA ───────────────────────────────────────────────────────
 *
 * Está reproducida aquí en vez de importada porque `recolector-local.mjs` se ejecuta al importarse (abre la
 * cola, pide plaza, arranca Chrome). Lo que importa es que el SQL sea EXACTAMENTE el mismo; si allí cambia,
 * hay que cambiarlo aquí, y por eso se deja dicho.
 */
const SQL_SIGUIENTE = `
    select * from trabajos
    where estado in ('pendiente', 'bloqueado')
      and (siguiente_intento is null or siguiente_intento <= ?)
      and (trabajos.temporada is null or trabajos.temporada not in (select codigo from temporadas where etiqueta < ?))
    order by prioridad, coalesce(cast(temporada as integer), -1) desc,
      case when tipo='acta' then 0 else 1 end, creado_en
    limit 1
  `;

console.log('\n── plan que elige SQLite para «siguienteTrabajo» ──');
for (const p of db.prepare(`explain query plan ${SQL_SIGUIENTE}`).all(ahora(), TEMPORADA_MINIMA)) {
  console.log(`  ${p.detail ?? p.DETAIL ?? JSON.stringify(p)}`);
}

const sentencia = db.prepare(SQL_SIGUIENTE);
const msSiguiente = [];
let trabajo = null;
for (let i = 0; i < REPETICIONES; i += 1) {
  msSiguiente.push(cronometra(() => { trabajo = sentencia.get(ahora(), TEMPORADA_MINIMA); }));
}
console.log('\n── coste medido, en vivo ──');
console.log(`  siguienteTrabajo (la que corre el recolector)  ${formato(estadistica(msSiguiente))}`);
console.log(`    elige: ${trabajo ? `${trabajo.tipo} · prioridad ${trabajo.prioridad} · ${trabajo.clave}` : '(nada)'}`);

// Consultas de control: corren antes de CADA petición, así que su coste se paga en cada vuelta del bucle.
const sentenciaHoy = db.prepare('select count(*) n from peticiones where dia_madrid = ?');
const sentenciaUltima = db.prepare('select * from peticiones order by id desc limit 1');
const msHoy = [];
const msUltima = [];
for (let i = 0; i < REPETICIONES * 5; i += 1) {
  msHoy.push(cronometra(() => sentenciaHoy.get(ahora().slice(0, 10))));
  msUltima.push(cronometra(() => sentenciaUltima.get()));
}
console.log(`  peticionesHoy  (antes de cada petición)        ${formato(estadistica(msHoy))}`);
console.log(`  ultimaPeticion (antes de cada petición)        ${formato(estadistica(msUltima))}`);

/*
 * ── CONTROL: LA MISMA CONSULTA SIN LA EXPRESIÓN DEL ORDER BY ─────────────────────────────────────────────
 *
 * Si esta variante es mucho más rápida, el coste no está en filtrar sino en ORDENAR: el `ORDER BY` lleva
 * `coalesce(cast(temporada as integer), -1) desc`, una expresión que ningún índice de la tabla cubre, así que
 * SQLite tiene que materializar y ordenar todas las filas que pasan el filtro antes de poder devolver una.
 */
const SQL_CONTROL = SQL_SIGUIENTE.replace(
  'order by prioridad, coalesce(cast(temporada as integer), -1) desc,\n      case when tipo=\'acta\' then 0 else 1 end, creado_en',
  'order by prioridad, creado_en',
);
if (SQL_CONTROL !== SQL_SIGUIENTE) {
  const control = db.prepare(SQL_CONTROL);
  const msControl = [];
  for (let i = 0; i < REPETICIONES; i += 1) msControl.push(cronometra(() => control.get(ahora(), TEMPORADA_MINIMA)));
  console.log(`  CONTROL sin la expresión del ORDER BY           ${formato(estadistica(msControl))}`);
  console.log('    (si es mucho menor, el coste es ORDENAR, no filtrar)');
  for (const p of db.prepare(`explain query plan ${SQL_CONTROL}`).all(ahora(), TEMPORADA_MINIMA)) {
    console.log(`    plan: ${p.detail ?? p.DETAIL ?? JSON.stringify(p)}`);
  }
} else {
  console.log('  (no se pudo construir la consulta de control: el ORDER BY de arriba ha cambiado)');
}

// ¿Cuántas filas pasan el filtro? Es el tamaño de lo que hay que ordenar.
const pasan = db.prepare(`select count(*) n from trabajos
  where estado in ('pendiente','bloqueado')
    and (siguiente_intento is null or siguiente_intento <= ?)
    and (trabajos.temporada is null or trabajos.temporada not in (select codigo from temporadas where etiqueta < ?))`)
  .get(ahora(), TEMPORADA_MINIMA).n;
console.log(`\n  filas que pasan el filtro (lo que hay que ordenar): ${Number(pasan).toLocaleString('es-ES')}`);
console.log(`  coste por trabajo = lo de arriba; a ${(pasan / 1000).toFixed(0)}k filas por vuelta, eso es lo que`);
console.log('  separa el ciclo real del recolector de la cortesía que tiene configurada.');

db.close();
