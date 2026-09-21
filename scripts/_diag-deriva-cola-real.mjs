// ¿Por qué la huella lógica de la cola REAL de Euskadi no coincide con la de la copia de referencia?
//
// `comparar-cola.mjs` dice si dos colas coinciden, pero no QUIÉN cambió ni QUÉ cambió. Este diagnóstico
// compara fila a fila la cola real contra una copia de referencia y atribuye cada diferencia:
//
//   - campos que difieren (nunca `actualizado_en`, que es lo que cambia al reescribir una fila igual);
//   - `actualizado_en` de las filas que difieren, que es la prueba de si las reescribió un worker
//     DESPUÉS del corte (y no una reconstrucción, que escribe dentro de una transacción por jornada y
//     deja el diario);
//   - jornadas con diferencias, para poder cruzarlas con el manifiesto aplicado.
//
// Sólo lee. `iterate()` mantiene una fila en memoria, no las 34.358.
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const CLAVE = ['temporada', 'competicion', 'grupo', 'jornada', 'orden'];
const CAMPOS = [
  'codigo_acta', 'equipo_local_codigo', 'equipo_visitante_codigo', 'local', 'visitante',
  'goles_local', 'goles_visitante', 'fecha', 'hora', 'campo', 'campo_codigo', 'arbitro',
];

function lee(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const filas = new Map();
    for (const f of db.prepare(`select ${[...CLAVE, ...CAMPOS, 'actualizado_en'].join(', ')} from partidos`).iterate()) {
      filas.set(CLAVE.map((c) => f[c]).join('\u0001'), f);
    }
    return filas;
  } finally { db.close(); }
}

const [rutaReal, rutaBase] = process.argv.slice(2);
if (!rutaReal || !rutaBase) {
  console.error('uso: node scripts/_diag-deriva-cola-real.mjs <cola.sqlite> <copia-de-referencia.sqlite>');
  process.exit(2);
}
for (const r of [rutaReal, rutaBase]) {
  if (!existsSync(r)) { console.error(`no existe: ${r}`); process.exit(2); }
}

const real = lee(rutaReal);
const base = lee(rutaBase);
console.log(`real  ${rutaReal} · ${real.size} filas`);
console.log(`base  ${rutaBase} · ${base.size} filas`);

const soloReal = [...real.keys()].filter((k) => !base.has(k));
const soloBase = [...base.keys()].filter((k) => !real.has(k));
console.log(`\nfilas sólo en la real: ${soloReal.length}`);
console.log(`filas sólo en la base: ${soloBase.length}`);
for (const k of soloReal.slice(0, 5)) console.log(`  real  · ${etiqueta(real.get(k))}`);
for (const k of soloBase.slice(0, 5)) console.log(`  base  · ${etiqueta(base.get(k))}`);

const porCampo = new Map();
const jornadas = new Map();
let cambiadas = 0;
for (const [k, a] of real) {
  const b = base.get(k);
  if (!b) continue;
  const distintos = CAMPOS.filter((c) => !mismo(a[c], b[c]));
  if (!distintos.length) continue;
  cambiadas++;
  for (const c of distintos) {
    const e = porCampo.get(c) ?? { n: 0, ejemplos: [] };
    e.n++;
    if (e.ejemplos.length < 3) e.ejemplos.push(`${etiqueta(a)} · ${c}: «${b[c]}» → «${a[c]}»`);
    porCampo.set(c, e);
  }
  const j = CLAVE.slice(0, 4).map((c) => a[c]).join('/');
  const e = jornadas.get(j) ?? { n: 0, acta: b.codigo_acta, marca: a.actualizado_en };
  e.n++;
  jornadas.set(j, e);
}

function mismo(x, y) { return x === y || (x === null && y === undefined) || (x === undefined && y === null); }
function etiqueta(f) { return `${f.temporada}/${f.competicion}/${f.grupo}/${f.jornada}/${f.orden} ${f.local}-${f.visitante}`; }

console.log(`\nfilas con algún campo distinto: ${cambiadas} de ${real.size}`);
if (!cambiadas) {
  console.log('  ningún campo de `partidos` difiere: la huella distinta sólo puede venir de otra tabla');
  process.exit(0);
}
console.log('\npor campo:');
for (const [c, e] of [...porCampo].sort((x, y) => y[1].n - x[1].n)) {
  console.log(`  ${c}: ${e.n}`);
  for (const ej of e.ejemplos) console.log(`      ${ej}`);
}

console.log(`\njornadas afectadas: ${jornadas.size}`);
const ordenadas = [...jornadas].sort((x, y) => String(x[1].marca).localeCompare(String(y[1].marca)));
console.log('  las 10 con `actualizado_en` más antiguo, y las 10 más reciente:');
for (const [j, e] of [...ordenadas.slice(0, 10), ...ordenadas.slice(-10)]) {
  console.log(`    ${j} · ${e.n} filas · actualizado_en ${e.marca} · acta ${e.acta ?? '(sin acta)'}`);
}
