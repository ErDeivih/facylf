#!/usr/bin/env node
/*
 * ── LOS HUECOS LARGOS, UNO A UNO Y CON SU HORA ───────────────────────────────────────────────────────────
 *
 * Ya se sabe que una parte grande del reloj se va en espacios de más de un minuto, y que NO son relevos de
 * sesión, ni falta de trabajo, ni peticiones colgadas, ni ráfagas (las cuatro cosas están descartadas con
 * medidas en RITMO-MEDIDO.md §6.6). Lo que falta es lo más simple: **verlos**.
 *
 * Un porcentaje no dice nada; una lista con la hora de cada hueco sí: se puede cruzar con el registro del
 * worker y con lo que estaba pasando en la máquina en ese minuto. Es la diferencia entre saber que hay un
 * agujero y saber qué lo cava.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/lista-huecos-largos.mjs [federación] [horas] [segundos_mínimos]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'andalucia';
const HORAS = Number(process.argv[3] ?? 2);
const MINIMO = Number(process.argv[4] ?? 60);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
const desde = new Date(Date.now() - HORAS * 3600_000).toISOString();
const filas = db.prepare(`select iniciada_en t, duracion_ms d, trabajo, resultado from peticiones
  where iniciada_en >= ? order by iniciada_en`).all(desde);
db.close();

if (filas.length < 3) {
  console.log(`${FEDERACION}: muy pocas peticiones en ${HORAS} h`);
  process.exit(0);
}

// La hora se enseña en horario de Madrid (+2 en septiembre), que es con la que se leen los registros.
const hora = (iso) => new Date(Date.parse(iso) + 2 * 3600_000).toISOString().slice(11, 19);

const largos = [];
for (let i = 1; i < filas.length; i += 1) {
  const segundos = (Date.parse(filas[i].t) - Date.parse(filas[i - 1].t)) / 1000;
  if (segundos >= MINIMO) {
    largos.push({
      segundos,
      desde: hora(filas[i - 1].t),
      hasta: hora(filas[i].t),
      // Lo que se estaba pidiendo justo antes y justo después del hueco: si es el mismo tipo de trabajo, el
      // hueco no es un cambio de fase; si cambia, puede ser que se acabara una tanda.
      antes: String(filas[i - 1].trabajo ?? '').split('|')[0],
      despues: String(filas[i].trabajo ?? '').split('|')[0],
      resultadoAntes: String(filas[i - 1].resultado ?? ''),
    });
  }
}

const total = largos.reduce((a, h) => a + h.segundos, 0);
console.log(`══ ${FEDERACION} · huecos de ${MINIMO} s o más · últimas ${HORAS} h ══\n`);
console.log(`  peticiones: ${filas.length} · huecos largos: ${largos.length} · `
  + `tiempo en ellos: ${(total / 60).toFixed(1)} min de ${HORAS * 60} (${(100 * total / (HORAS * 3600)).toFixed(0)} %)\n`);

if (!largos.length) {
  console.log('  Ninguno. El ritmo lo manda el ciclo del worker y optimizarlo sí sirve.');
  process.exit(0);
}

console.log('    minutos   desde      hasta      antes de      después de     resultado previo');
for (const h of largos.slice(0, 25)) {
  console.log(`  ${(h.segundos / 60).toFixed(1).padStart(8)}   ${h.desde}   ${h.hasta}   `
    + `${h.antes.padEnd(12)}  ${h.despues.padEnd(12)}   ${h.resultadoAntes}`);
}
if (largos.length > 25) console.log(`  … y ${largos.length - 25} más`);

// Y la distribución por tamaño, que distingue causas: un minuto es una pausa, media hora es que no hay nada
// que hacer o que el worker está en otra cosa.
const tramos = [[60, 120], [120, 300], [300, 900], [900, 3600], [3600, Infinity]];
console.log('\n  ── por tamaño ──');
for (const [a, b] of tramos) {
  const lista = largos.filter((h) => h.segundos >= a && h.segundos < b);
  if (!lista.length) continue;
  const suma = lista.reduce((x, h) => x + h.segundos, 0);
  const etiqueta = b === Infinity ? `más de ${a / 60} min` : `${a / 60}-${b / 60} min`;
  console.log(`  ${etiqueta.padEnd(16)} ${String(lista.length).padStart(4)} huecos   `
    + `${(suma / 60).toFixed(1).padStart(7)} min`);
}
