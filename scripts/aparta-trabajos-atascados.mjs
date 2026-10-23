/*
 * ── TRABAJOS ATASCADOS EN REINTENTOS: el caso de Cataluña ───────────────────────────────────────────────
 *
 * Medido el 28/09/2026: Cataluña llevaba **0 actas en 24 horas** y sin embargo trabajaba a 403 peticiones/hora.
 * El motivo estaba en su cola: un calendario (`calendario|22|58162174|58162188|`) acumulaba **86 intentos** con
 * el mismo error («el calendario no muestra ninguna jornada») y seguía volviendo a la cola. En la última hora
 * cerró 1.732 calendarios y 1.682 clasificaciones, y sólo 56 actas: se estaba gastando el turno en trabajos que
 * no pueden salir.
 *
 * Un trabajo que ha fallado muchas veces con el MISMO motivo no va a salir por insistir: lo que hace es
 * ocupar el sitio de los que sí pueden. Se cancelan, con su motivo escrito y contando cuántos intentos
 * llevaban, y si la fuente cambia el catálogo se re-sincroniza y vuelven a entrar.
 *
 * El umbral es deliberadamente alto (5 intentos) para no tirar trabajos que sólo han tenido mala suerte.
 *
 * Uso:  node scripts/aparta-trabajos-atascados.mjs <federacion> [--aplicar] [--intentos 5]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const COLA = {
  valencia: 'descargas-valencia/recolector-local/cola-v2.sqlite',
  madrid: 'descargas-madrid/recolector-local/cola-v2.sqlite',
  cataluna: 'descargas-cataluna/recolector-local/cola-v2.sqlite',
  'castilla-leon': 'descargas-federacion/recolector-local/cola-v2.sqlite',
};
const federacion = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
const idx = process.argv.indexOf('--intentos');
const UMBRAL = idx > 0 ? Number(process.argv[idx + 1]) : 5;

if (!federacion || !COLA[federacion]) {
  console.error(`uso: node scripts/aparta-trabajos-atascados.mjs <${Object.keys(COLA).join('|')}> [--aplicar] [--intentos 5]`);
  process.exit(2);
}
const ruta = COLA[federacion];
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${federacion}: ${ruta}`);
  process.exit(1);
}
const db = new DatabaseSync(ruta);

console.log(`=== ${federacion.toUpperCase()} · trabajos con ${UMBRAL} intentos o más ===`);
const atascados = db.prepare(`select tipo, count(*) as n, max(intentos) as peor from trabajos
  where estado in ('pendiente','bloqueado') and intentos >= ? group by 1 order by 2 desc`).all(UMBRAL);
if (!atascados.length) console.log('  ninguno');
for (const f of atascados) {
  console.log(`  ${String(f.tipo).padEnd(18)} ${String(f.n).padStart(6)} trabajos · el peor con ${f.peor} intentos`);
}

const total = db.prepare(`select count(*) as n from trabajos where estado in ('pendiente','bloqueado') and intentos >= ?`).get(UMBRAL).n;
const pendientesAntes = db.prepare(`select count(*) as n from trabajos where estado='pendiente'`).get().n;
console.log(`\n  total a apartar: ${total} de ${pendientesAntes} pendientes`);

console.log('\n=== LOS 5 PEORES, CON SU MOTIVO ===');
for (const t of db.prepare(`select tipo, clave, intentos, substr(coalesce(ultimo_error,'(sin error)'),1,70) as err
  from trabajos where estado in ('pendiente','bloqueado') and intentos >= ? order by intentos desc limit 5`).all(UMBRAL)) {
  console.log(`  ${String(t.intentos).padStart(4)} intentos · ${t.tipo} ${t.clave}`);
  console.log(`        ${t.err}`);
}

if (APLICAR && total > 0) {
  const r = db.prepare(`update trabajos set estado='apartado',
      ultimo_error='apartado tras ' || intentos || ' intentos con el mismo motivo: no sale por insistir y ocupa el sitio de los que sí pueden',
      actualizado_en=datetime('now')
    where estado in ('pendiente','bloqueado') and intentos >= ?`).run(UMBRAL);
  console.log(`\n=== APLICADO: ${r.changes} trabajos apartados ===`);
  console.log(`  pendientes: ${pendientesAntes} -> ${db.prepare(`select count(*) as n from trabajos where estado='pendiente'`).get().n}`);
} else if (!APLICAR) {
  console.log('\n(medición: no se ha cambiado nada. Con --aplicar se hace.)');
}

/*
 * Y LOS «EN CURSO» COLGADOS.
 *
 * Medido también el 28/09/2026: Cataluña tenía **113 trabajos en estado `en_curso`** con un solo worker. Son
 * restos de sesiones que murieron sin cerrarlos: mientras estén así, no se vuelven a coger nunca, y una cola
 * puede quedarse con cientos de trabajos secuestrados. Se devuelven a `pendiente` los que llevan más de una
 * hora parados (los que el worker tiene de verdad en la mano son de hace segundos).
 */
const COLGADOS = db.prepare(`select count(*) as n from trabajos
  where estado='en_curso' and actualizado_en < datetime('now','-1 hour')`).get().n;
console.log(`\n=== «EN CURSO» COLGADOS (más de 1 hora sin tocarse): ${COLGADOS} ===`);
if (APLICAR && COLGADOS > 0) {
  const r2 = db.prepare(`update trabajos set estado='pendiente', actualizado_en=datetime('now')
    where estado='en_curso' and actualizado_en < datetime('now','-1 hour')`).run();
  console.log(`  devueltos a pendiente: ${r2.changes}`);
} else if (!APLICAR && COLGADOS > 0) {
  console.log('  (con --aplicar se devuelven a pendiente)');
}

console.log('\n=== ESTADO DE LA COLA ===');
for (const f of db.prepare(`select estado, count(*) as n from trabajos group by 1 order by 2 desc`).all()) {
  console.log(`  ${String(f.estado).padEnd(12)} ${f.n}`);
}
db.close();
