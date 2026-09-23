#!/usr/bin/env node
/*
 * ── ¿CUÁNTO TARDA UNA SESIÓN DESDE QUE ARRANCA HASTA QUE PIDE LA PRIMERA PÁGINA? ─────────────────────────
 *
 * El análisis de huecos dejaba un 40-55 % del reloj en espacios de más de un minuto, y las explicaciones
 * fáciles ya están descartadas una a una (RITMO_MEDIDO §6.6): no son relevos largos del supervisor (20 s), no
 * es falta de trabajo (49.146 disponibles), no son peticiones colgadas (la más lenta, 10 s) y no son reinicios
 * de contenedor (0-2 en tres horas). Tampoco son ráfagas: hay actividad en todos los tramos de cinco minutos.
 *
 * Mirando el registro de Andalucía aparece esto:
 *
 *     11:48:40  El worker termino con codigo 0; siguiente intento en 20 s.
 *     11:49:00  Arrancando o reanudando la ingesta.       ← la sesión arranca
 *     11:53:18  (primera petición de esa sesión)          ← CUATRO MINUTOS DESPUÉS
 *
 * O sea: el hueco no está entre una petición y la siguiente, está **entre arrancar la sesión y la primera
 * petición**. Y ahí, antes de pedir nada, el worker hace trabajo local que sale en el registro:
 *
 *     Plan local preparado: 4 temporadas y 3288 competiciones candidatas.
 *       · Preparando vigilancia y ámbito de actas (trabajo local).
 *       · Revisando calendario futuro y jornadas recientes (trabajo local).
 *       · Temporada actual: 4529 jornadas futuras y 131 clasificaciones sin resultados quedan aplazadas.
 *       · sesión limitada a 240 trabajos para reciclar Chrome y contener la memoria.
 *
 * Este programa mide ese retraso con datos y no a ojo: coge las horas de arranque de sesión del REGISTRO (que
 * es lo único que lleva fecha) y las primeras peticiones de la COLA, y mide la diferencia.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/mide-arranque-sesion.mjs [federación] [horas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const HORAS = Number(process.argv[3] ?? 3);

const carpeta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local');
const rutaCola = join(carpeta, 'cola-v2.sqlite');
const rutaLog = join(carpeta, 'worker-programado.log');
if (!existsSync(rutaCola) || !existsSync(rutaLog)) {
  console.error(`faltan ficheros de ${FEDERACION}`);
  process.exit(2);
}

// Las marcas de arranque de sesión, que SÍ llevan fecha, en horario de Madrid (el registro las escribe así).
const desde = Date.now() - HORAS * 3600_000;
const arranques = [];
for (const linea of readFileSync(rutaLog, 'utf8').split('\n')) {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\s+Arrancando o reanudando la ingesta/.exec(linea);
  if (!m) continue;
  // Madrid es UTC+2 en septiembre: se convierte a epoch para poder cruzar con las peticiones (que van en UTC).
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
    - 2 * 3600_000;
  if (t >= desde) arranques.push(t);
}

const db = new DatabaseSync(rutaCola, { readOnly: true, timeout: 30_000 });
const peticiones = db.prepare('select iniciada_en from peticiones where iniciada_en >= ? order by iniciada_en')
  .all(new Date(desde).toISOString())
  .map((f) => Date.parse(f.iniciada_en));
db.close();

if (arranques.length === 0) {
  console.log(`${FEDERACION}: ningún arranque de sesión en las últimas ${HORAS} h`);
  process.exit(0);
}

console.log(`══ ${FEDERACION} · ${arranques.length} arranques de sesión · últimas ${HORAS} h ══\n`);
console.log('  hora de arranque   1.ª petición   retraso');

const retrasos = [];
for (const t of arranques) {
  // La primera petición DESPUÉS del arranque y antes del siguiente arranque.
  const siguiente = arranques.find((x) => x > t) ?? Infinity;
  const primera = peticiones.find((p) => p >= t && p < siguiente);
  if (primera === undefined) {
    console.log(`  ${horaLocal(t)}      (ninguna petición antes del siguiente arranque)`);
    continue;
  }
  const retraso = (primera - t) / 1000;
  retrasos.push(retraso);
  console.log(`  ${horaLocal(t)}     ${horaLocal(primera)}      ${(retraso / 60).toFixed(1)} min`);
}

function horaLocal(epoch) {
  return new Date(epoch + 2 * 3600_000).toISOString().slice(11, 19);
}

if (retrasos.length) {
  const orden = [...retrasos].sort((a, b) => a - b);
  const media = retrasos.reduce((a, b) => a + b, 0) / retrasos.length;
  console.log(`\n  retraso mediano hasta la primera petición: ${(orden[Math.floor(orden.length / 2)] / 60).toFixed(1)} min`);
  console.log(`  media ${(media / 60).toFixed(1)} min · total ${(media * retrasos.length / 60).toFixed(1)} min `
    + `en ${arranques.length} arranques`);
  console.log('\n  Ese tiempo se va en trabajo local ANTES de pedir nada: preparar el plan, la vigilancia,');
  console.log('  aplazar jornadas futuras y REPRIORIZAR el plan, que recorre todos los trabajos pendientes.');
  console.log('  Con una cola de decenas de miles de trabajos, eso no es gratis. Si el retraso es de minutos,');
  console.log('  la palanca no es el ciclo del worker: es no pagar esto en cada arranque.');
}
