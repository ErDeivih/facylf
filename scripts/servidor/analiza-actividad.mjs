#!/usr/bin/env node
/*
 * ── ¿TRABAJA EN RÁFAGAS O DE FORMA CONTINUA? ─────────────────────────────────────────────────────────────
 *
 * Las cuentas no cuadran y hay que verlo. En Andalucía, 570 peticiones en tres horas con una duración mediana
 * de 3,2 s: eso son 35 minutos DENTRO de peticiones de 180. Y el registro dice que las sesiones duran ~160-220
 * trabajos y que el supervisor sólo espera 20 s entre una y otra. Con esas cifras, tres sesiones deberían
 * ocupar poco más de una hora, no tres.
 *
 * Algo no encaja, y la forma de salir de dudas es mirar el reloj: **peticiones por tramo de cinco minutos**. Si
 * la federación trabaja en ráfagas, el histograma lo enseña de un vistazo: tramos llenos seguidos de tramos
 * vacíos. Y si trabaja de forma continua y lenta, todos los tramos salen parecidos.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/analiza-actividad.mjs [federación] [horas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const HORAS = Number(process.argv[3] ?? 3);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
const desdeMs = Date.now() - HORAS * 3600_000;
const filas = db.prepare('select iniciada_en, duracion_ms from peticiones where iniciada_en >= ? order by iniciada_en')
  .all(new Date(desdeMs).toISOString());
db.close();

if (!filas.length) {
  console.log(`${FEDERACION}: sin peticiones en ${HORAS} h`);
  process.exit(0);
}

const TRAMO_MS = 5 * 60_000;
const tramos = Math.ceil(HORAS * 3600_000 / TRAMO_MS);
const cuenta = new Array(tramos).fill(0);
const dentroMs = new Array(tramos).fill(0);

for (const f of filas) {
  const i = Math.floor((Date.parse(f.iniciada_en) - desdeMs) / TRAMO_MS);
  if (i >= 0 && i < tramos) {
    cuenta[i] += 1;
    dentroMs[i] += Number(f.duracion_ms ?? 0);
  }
}

// Escala de la barra: el tramo más lleno ocupa 40 caracteres.
const maximo = Math.max(...cuenta, 1);
const hora = (i) => new Date(desdeMs + i * TRAMO_MS).toLocaleTimeString('es-ES',
  { hour: '2-digit', minute: '2-digit' });

console.log(`══ ${FEDERACION} · peticiones cada 5 min · últimas ${HORAS} h ══`);
console.log('  (cada bloque son 5 minutos; la barra es cuántas peticiones se hicieron en ese tramo)\n');
console.log('  hora    pet  barra');

let vacios = 0;
let petEnVacios = 0;
for (let i = 0; i < tramos; i += 1) {
  const n = cuenta[i];
  if (n === 0) vacios += 1;
  const barra = '#'.repeat(Math.round(40 * n / maximo));
  const dentro = dentroMs[i] / 1000;
  console.log(`  ${hora(i)}  ${String(n).padStart(3)}  ${barra}`
    + (n === 0 ? '   ← SIN NINGUNA PETICIÓN' : `   (${dentro.toFixed(0)} s dentro de peticiones)`));
  petEnVacios += n;
}

const ocupados = tramos - vacios;
console.log(`\n  tramos de 5 min: ${tramos} · con actividad: ${ocupados} · VACÍOS: ${vacios} `
  + `(${(100 * vacios / tramos).toFixed(0)} % del tiempo)`);
console.log(`  peticiones totales: ${filas.length} · en los tramos vacíos no hubo ninguna`);

const mediaOcupado = filas.length / (ocupados || 1);
console.log(`\n  → Cuando trabaja, hace ${mediaOcupado.toFixed(0)} peticiones por tramo `
  + `(${(mediaOcupado / 5).toFixed(1)} pet/min).`);
if (vacios > tramos * 0.2) {
  console.log(`  → Y ${vacios} de ${tramos} tramos están VACÍOS: la federación no trabaja en ráfagas de minutos,`);
  console.log('    sino que se queda parada tramos enteros. Eso NO lo arregla optimizar el ciclo del worker.');
} else {
  console.log('  → Trabaja de forma continua: el ritmo lo manda el ciclo del worker y optimizarlo sí sirve.');
}
