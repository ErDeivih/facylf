#!/usr/bin/env node
/*
 * ── ¿EN QUÉ SE VA EL TIEMPO QUE NO ESTÁ EN NINGÚN TRABAJO? ───────────────────────────────────────────────
 *
 * La medición por fases explica el ciclo de los trabajos que OCURREN. Pero una federación no hace
 * `3600 / ciclo` peticiones a la hora: Murcia, con un ciclo medido de 8,1 s (444 pet/h teóricas), hace ~200.
 *
 * **La mitad del tiempo no está en ningún trabajo.** Y ahí no llega la instrumentación por fases, porque lo que
 * no ocurre no se puede cronometrar desde dentro de un trabajo. Este programa lo saca de la tabla `peticiones`,
 * que sí tiene la hora exacta de cada petición: mira la distribución de los HUECOS entre peticiones
 * consecutivas y dice cuánto tiempo se va en cada tramo.
 *
 * Y la forma de la distribución distingue las causas, que se arreglan de formas opuestas:
 *
 *   · muchos huecos del tamaño del ciclo  → la federación está trabajando; el tiempo está en el ciclo;
 *   · unos pocos huecos enormes           → son RELEVOS: la sesión termina, se cierra Chrome, el supervisor
 *                                            espera y se abre otro. Ahí no se recolecta nada, y el arreglo es
 *                                            que las sesiones duren más o que el relevo sea más rápido;
 *   · huecos de decenas de segundos       → plazas, pausas por fallos, aplazamientos o la cola bloqueada.
 *
 * Uso (dentro de un contenedor, el host no tiene Node):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/analiza-huecos-federacion.mjs [federación] [horas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'murcia';
const HORAS = Number(process.argv[3] ?? 3);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

const db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
const desde = new Date(Date.now() - HORAS * 3600_000).toISOString();
const filas = db.prepare(`select iniciada_en t, duracion_ms d from peticiones
  where iniciada_en >= ? order by iniciada_en`).all(desde);

// Y de paso: cuántas filas tiene la cola de historial de peticiones, que crece sin fin y engorda la base.
const totalPeticiones = Number(db.prepare('select count(*) n from peticiones').get().n);
db.close();

if (filas.length < 5) {
  console.log(`${FEDERACION}: sólo ${filas.length} peticiones en ${HORAS} h; no hay nada que analizar.`);
  process.exit(0);
}

const inicio = Date.parse(filas[0].t);
const fin = Date.parse(filas[filas.length - 1].t);
const reloj = (fin - inicio) / 1000;

const huecos = [];
for (let i = 1; i < filas.length; i += 1) {
  const h = (Date.parse(filas[i].t) - Date.parse(filas[i - 1].t)) / 1000;
  if (Number.isFinite(h) && h >= 0) huecos.push(h);
}
const orden = [...huecos].sort((a, b) => a - b);
const sumaHuecos = huecos.reduce((a, b) => a + b, 0);

// El tiempo DENTRO de las peticiones se mide aparte: es lo que el portal tarda en servir la página.
const dentro = filas.map((f) => Number(f.d) / 1000).filter((d) => Number.isFinite(d) && d > 0)
  .reduce((a, b) => a + b, 0);

const tramos = [
  ['ciclo normal (0-15 s)', (h) => h < 15],
  ['hueco medio (15-60 s)', (h) => h >= 15 && h < 60],
  ['relevo largo (1-5 min)', (h) => h >= 60 && h < 300],
  ['parada (> 5 min)', (h) => h >= 300],
];

const f = (n) => n.toFixed(1).padStart(9);
console.log(`══ ${FEDERACION} · últimas ${HORAS} h ══`);
console.log(`  peticiones: ${filas.length} · reloj cubierto: ${(reloj / 60).toFixed(1)} min · `
  + `ritmo real: ${(filas.length / (reloj / 3600)).toFixed(0)} pet/h`);
console.log(`  (la cola guarda ${totalPeticiones.toLocaleString('es-ES')} peticiones de historial)\n`);

console.log('  hueco entre peticiones:  mediana ' + `${orden[Math.floor(orden.length / 2)].toFixed(1)} s` +
  ` · p95 ${orden[Math.floor(0.95 * orden.length)].toFixed(1)} s · máximo ${orden[orden.length - 1].toFixed(1)} s`);

console.log('\n  ── en qué se va el reloj ──');
console.log('  concepto                          segundos      % del reloj');
const dentroPet = Math.min(dentro, reloj);
console.log(`  dentro de la petición      ${f(dentroPet)}      ${(100 * dentroPet / reloj).toFixed(0).padStart(4)} %`);

let acumulado = 0;
for (const [nombre, cumple] of tramos) {
  const lista = huecos.filter(cumple);
  const total = lista.reduce((a, b) => a + b, 0);
  acumulado += total;
  const tiempoCiclo = nombre === 'ciclo normal (0-15 s)' ? total - dentroPet : 0;
  console.log(`  ${nombre.padEnd(26)} ${f(total)}      ${(100 * total / reloj).toFixed(0).padStart(4)} %`
    + (lista.length ? `   (${lista.length} huecos)` : '')
    + (nombre === 'ciclo normal (0-15 s)'
      ? `\n    · dentro de esas peticiones ${f(dentroPet)}   · el resto, ciclo del worker: ${f(Math.max(0, tiempoCiclo))}`
      : ''));
}

/*
 * La lectura que importa: si los huecos grandes se llevan una parte apreciable del reloj, el ritmo NO lo manda
 * el ciclo del worker —lo manda cuánto tiempo se pasa SIN trabajar— y optimizar el ciclo da mucho menos de lo
 * que promete.
 */
const grandes = huecos.filter((h) => h >= 60).reduce((a, b) => a + b, 0);
if (grandes > 0) {
  console.log(`\n  → Los huecos de más de un minuto se llevan ${(grandes / 60).toFixed(1)} min de `
    + `${(reloj / 60).toFixed(1)} (${(100 * grandes / reloj).toFixed(0)} %).`);
  console.log('     Eso son RELEVOS DE SESIÓN (cerrar Chrome, esperar al supervisor, abrir otro), no el ciclo');
  console.log('     del worker. Ninguna optimización del ciclo puede recuperar ese tiempo.');
} else {
  console.log('\n  → No hay huecos grandes: el ritmo lo manda el ciclo del worker, y optimizarlo sí sirve.');
}
