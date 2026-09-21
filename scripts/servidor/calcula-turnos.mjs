#!/usr/bin/env node
/*
 * ── REPARTE EL TIEMPO DE PLAZA SEGÚN EL TAMAÑO DE CADA FEDERACIÓN ──────────────────────────────────────
 *
 * Con 19 federaciones y 11 plazas de navegador no caben todas a la vez, así que el turno decide cuánto tiempo
 * tiene cada una. Hasta ahora el turno era el mismo para todas (`FACYLF_TURNO_PLAZA_MIN=150`): las pequeñas
 * —Ceuta, con 360 trabajos— gastaban el mismo hueco que Cataluña, con 93 684. Eso no es reparto, es orden de
 * llegada.
 *
 * Esto calcula un turno **proporcional al trabajo pendiente** (con topes de 1 h a 8 h, para que las pequeñas
 * circulen y las grandes no se queden pegadas a la plaza) y escribe `docker/compose-turnos.yml`, un fichero de
 * sobrescritura que se aplica encima del compose base:
 *
 *   docker compose -p facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml up -d
 *
 * Es un fichero GENERADO: se vuelve a ejecutar este guion cuando el trabajo pendiente cambie de reparto y las
 * federaciones que van terminando sueltan plaza más a menudo sin tocar nada a mano.
 *
 * Uso:  node scripts/servidor/calcula-turnos.mjs [--raiz .] [--salida docker/compose-turnos.yml] [--seco]
 *       node scripts/servidor/calcula-turnos.mjs --reparto 240 --minimo 60 --maximo 480
 */
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };

const RAIZ = resolve(arg('raiz', '.'));
const SALIDA = resolve(arg('salida', join(RAIZ, 'docker', 'compose-turnos.yml')));
const REPARTO_MIN = Number(arg('reparto', 240));   // turno de una federación «media»
const MINIMO = Number(arg('minimo', 60));
const MAXIMO = Number(arg('maximo', 480));
const SECO = argumentos.includes('--seco');

const FEDERACIONES = [
  'andalucia', 'aragon', 'asturias', 'baleares', 'canarias', 'cantabria', 'castilla-la-mancha', 'cataluna',
  'ceuta', 'euskadi', 'extremadura', 'federacion', 'galicia', 'madrid', 'melilla', 'murcia', 'navarra',
  'rioja', 'valencia',
];

/** El trabajo que le queda a cada federación (pendiente y bloqueado, que es lo que hay que recolectar). */
function pendientesDe(federacion) {
  const cola = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(cola)) return null;
  let db;
  try {
    db = new DatabaseSync(cola, { readOnly: true });
    const fila = db.prepare("select count(*) n from trabajos where estado in ('pendiente','bloqueado')").get();
    return { pendientes: Number(fila?.n ?? 0), mb: Math.round(statSync(cola).size / 1024 ** 2) };
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

const datos = [];
for (const federacion of FEDERACIONES) {
  const dato = pendientesDe(federacion);
  if (dato) datos.push({ federacion, ...dato });
}
if (!datos.length) {
  console.error(`No se encontró ninguna cola en ${RAIZ}. ¿Es la raíz del repositorio?`);
  process.exit(1);
}

const total = datos.reduce((a, x) => a + x.pendientes, 0);
const media = total / datos.length;
const redondea30 = (minutos) => Math.max(MINIMO, Math.min(MAXIMO, Math.round(minutos / 30) * 30));

console.log(`reparto del turno de plaza · ${datos.length} federaciones · ${total.toLocaleString('es-ES')} trabajos pendientes`);
console.log(`  turno de una federación media: ${REPARTO_MIN} min · topes: ${MINIMO}-${MAXIMO} min\n`);
console.log('  federación            pendientes   % del total   turno');
const turnos = {};
for (const dato of datos.sort((a, b) => b.pendientes - a.pendientes)) {
  const proporcion = dato.pendientes / media;
  const turno = redondea30(REPARTO_MIN * proporcion);
  turnos[dato.federacion] = turno;
  console.log(`  ${dato.federacion.padEnd(20)} ${String(dato.pendientes).padStart(10)} `
    + `${((dato.pendientes / total) * 100).toFixed(1).padStart(11)} % ${String(turno).padStart(7)} min`);
}

// Un turno no puede ser tan corto que la federación no haga nada: con el ritmo configurado (6-8 s por
// petición) una hora son ~500 peticiones, que ya es una sesión con sentido.
const aviso = Object.entries(turnos).filter(([, min]) => min <= MINIMO).map(([f]) => f);
if (aviso.length) console.log(`\n  (con el turno mínimo, ${aviso.length} federaciones: ${aviso.join(', ')} — son las que casi han terminado)`);

const cabecera = `# GENERADO por scripts/servidor/calcula-turnos.mjs — no se edita a mano.
#
# Reparte el tiempo de plaza de navegador según el trabajo que le queda a cada federación: las grandes
# conservan la plaza más tiempo y las que están terminando la sueltan antes para que circule.
#
# Se aplica ENCIMA del compose base (los ficheros de compose se fusionan, así que aquí sólo va el turno):
#   docker compose -p facylf --env-file docker/.env \\
#     -f docker/compose.yml -f docker/compose-turnos.yml up -d
#
# Vuelve a generarlo cuando el reparto de trabajo cambie:
#   node scripts/servidor/calcula-turnos.mjs
services:`;

const cuerpo = Object.entries(turnos)
  .map(([federacion, turno]) => `  ${federacion}:\n    environment:\n      FACYLF_TURNO_PLAZA_MIN: "${turno}"`)
  .join('\n');

if (SECO) {
  console.log(`\n(ensayo) escribiría ${SALIDA}:\n\n${cabecera}\n${cuerpo}`);
} else {
  writeFileSync(SALIDA, `${cabecera}\n${cuerpo}\n`, 'utf8');
  console.log(`\nescrito ${SALIDA}`);
}
