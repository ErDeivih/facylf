#!/usr/bin/env node
/*
 * ── ¿DÓNDE ESTÁ EL TIEMPO QUE NO ES PETICIÓN? ───────────────────────────────────────────────────────────
 *
 * `diagnostica-ritmo.mjs` ya dice cuánto dura una petición y cuál es el hueco entre inicios. Lo que NO dice
 * es en qué se va ese hueco. Este programa lo abre en dos mitades, que son las dos únicas cosas que pueden
 * pasar entre el final de una petición y el inicio de la siguiente:
 *
 *   · **cortesía** — `ritmo.antes()` espera hasta `iniciada_en + minimo + jitter`. Se puede calcular sin
 *     tocar el recolector: si el hueco de reloj es MAYOR que la cortesía configurada, es que la cortesía
 *     no se está esperando (el trabajo local ya dura más) y todo el hueco es trabajo nuestro;
 *   · **trabajo local** — todo lo demás: análisis, guardado en disco, escrituras en SQLite, `siguienteTrabajo`,
 *     reciclado de Chrome, plaza…
 *
 * Por eso imprime, por federación: cuánto del hueco supera la cortesía configurada. Ese exceso es trabajo
 * local medido, no supuesto. La cortesía NO se suma a la petición: se mide de inicio a inicio, así que se
 * solapa con la página y este cálculo ya lo tiene en cuenta (se compara con el hueco, no se añade).
 *
 * Uso (dentro de un contenedor, el host no tiene Node):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/mide-huecos.mjs [minutos]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const MINUTOS = Number(process.argv[2] ?? 60);
const desde = new Date(Date.now() - MINUTOS * 60_000).toISOString();

/** Mediana de una lista ya ordenada. */
function mediana(ordenados) {
  if (!ordenados.length) return null;
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[medio] : (ordenados[medio - 1] + ordenados[medio]) / 2;
}

/** Percentil sobre una lista ya ordenada. */
function percentil(ordenados, p) {
  if (!ordenados.length) return null;
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))];
}

/**
 * Lee la cortesía configurada de la federación. El fichero de configuración vive en la raíz del repositorio
 * (`recolector.<federación>.config.json`) y el bloque es `ritmo.intervaloMinSeg` / `intervaloMaxSeg`.
 * Si no se puede leer, se devuelve null y esa federación se marca como «cortesía desconocida» en vez de
 * inventarse un número.
 */
function cortesiaDe(federacion) {
  for (const nombre of [`recolector.${federacion}.config.json`, 'recolector.config.json']) {
    const ruta = join(RAIZ, nombre);
    if (!existsSync(ruta)) continue;
    try {
      const cfg = JSON.parse(readFileSync(ruta, 'utf8'));
      const min = Number(cfg?.ritmo?.intervaloMinSeg);
      const max = Number(cfg?.ritmo?.intervaloMaxSeg);
      if (Number.isFinite(min) && Number.isFinite(max)) return { min, max, media: (min + max) / 2 };
    } catch { /* configuración ilegible: se prueba la siguiente */ }
  }
  return null;
}

const federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
  .sort();

console.log(`huecos entre peticiones · últimos ${MINUTOS} min · la cortesía NO se suma a la petición\n`);
console.log('  federación            pet/h  cortesía  ciclo_med  dentro_med  hueco_med  exceso_med  exceso_total/h');
console.log('                                (s)        (s)         (s)        (s)        (s)          (s)');

let petTotal = 0;
const excesosGlobales = [];

for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
    const filas = db.prepare(`select iniciada_en t, duracion_ms d from peticiones
      where iniciada_en >= ? order by iniciada_en`).all(desde);
    if (filas.length < 3) {
      console.log(`  ${federacion.padEnd(22)} ${String(filas.length).padStart(5)}  (sin peticiones suficientes)`);
      continue;
    }
    const cortesia = cortesiaDe(federacion);
    const huecos = [];
    const dentro = [];
    for (let i = 1; i < filas.length; i += 1) {
      const h = (Date.parse(filas[i].t) - Date.parse(filas[i - 1].t)) / 1000;
      if (Number.isFinite(h) && h >= 0) huecos.push(h);
    }
    for (const f of filas) {
      const d = Number(f.d) / 1000;
      if (Number.isFinite(d) && d > 0) dentro.push(d);
    }
    huecos.sort((a, b) => a - b);
    dentro.sort((a, b) => a - b);

    const reloj = MINUTOS * 60;
    const cicloMedio = reloj / filas.length;
    // Exceso = lo que el ciclo supera a la cortesía configurada. Si la cortesía manda, esto es ~0 y el techo
    // lo pone el propio ritmo pedido; si es grande, el techo lo pone el trabajo local del recolector.
    const excesoPorPeticion = cortesia ? Math.max(0, cicloMedio - cortesia.media) : null;
    if (excesoPorPeticion !== null) excesosGlobales.push(excesoPorPeticion);

    petTotal += filas.length;
    console.log(`  ${federacion.padEnd(22)} ${String(filas.length).padStart(5)}  `
      + `${(cortesia ? `${cortesia.min}-${cortesia.max}` : '—').padStart(8)}  `
      + `${cicloMedio.toFixed(1).padStart(8)}  `
      + `${(mediana(dentro) ?? 0).toFixed(1).padStart(10)}  `
      + `${(mediana(huecos) ?? 0).toFixed(1).padStart(9)}  `
      + `${(excesoPorPeticion === null ? '—' : excesoPorPeticion.toFixed(1)).padStart(10)}  `
      + `${(excesoPorPeticion === null ? '—' : (excesoPorPeticion * filas.length).toFixed(0)).padStart(13)}`);
  } catch (error) {
    console.log(`  ${federacion.padEnd(22)} no se pudo leer: ${error.message.slice(0, 50)}`);
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}

console.log(`\n  total: ${petTotal} peticiones en ${MINUTOS} min = ${(petTotal / MINUTOS).toFixed(1)} pet/min`);
if (excesosGlobales.length) {
  excesosGlobales.sort((a, b) => a - b);
  const suma = excesosGlobales.reduce((a, b) => a + b, 0);
  console.log(`  exceso medio por petición (trabajo local por encima de la cortesía): `
    + `${(suma / excesosGlobales.length).toFixed(1)} s · mediana ${mediana(excesosGlobales).toFixed(1)} s · `
    + `p95 ${percentil(excesosGlobales, 95).toFixed(1)} s`);
  console.log('  «exceso» = ciclo medio − cortesía media configurada. Es tiempo que NO está en la petición ni');
  console.log('  en la cortesía: análisis, guardado, SQLite, plaza, reciclado de Chrome o trabajo local.');
}
