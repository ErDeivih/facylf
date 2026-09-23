#!/usr/bin/env node
/*
 * ── ¿CUÁNTO TIENE QUE ESPERAR UN RECOLECTOR PARA ESCRIBIR EN SU COLA? ────────────────────────────────────
 *
 * La medición por fases de Murcia (23/09/2026) dice que el 55 % del ciclo de un trabajo (4,5 s de 8,2 s) se va
 * en «analisis_guardado», pero el análisis en sí cuesta milisegundos: `sha256` 0,7 ms y `gzip` 4,1 ms, medidos
 * con actas reales. Si no es el análisis, ¿qué es?
 *
 * La hipótesis que queda: **esperar el bloqueo de la cola**. Los recolectores abren su SQLite con
 * `busy_timeout = 120000` (dos minutos) justo porque el IMPORTADOR mantiene esa misma cola abierta mientras
 * importa una unidad, y hay unidades que tardan hasta 1.195 s. Si el worker pide el bloqueo de escritura y lo
 * tiene el importador, el worker se queda PARADO — sin gastar procesador, sin hacer peticiones y sin aparecer
 * en ningún registro.
 *
 * Esto lo mide directamente: pide el bloqueo de escritura de la cola de una federación N veces y cronometra lo
 * que tarda en concederlo. `begin immediate` toma el bloqueo de reserva SIN escribir nada, y el `rollback`
 * inmediato lo suelta: **no modifica ni una fila**.
 *
 * Es la diferencia entre dos arreglos opuestos: si lo que cuesta es el análisis, se optimiza el análisis; si es
 * esperar el bloqueo, lo que hay que arreglar es al importador.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/mide-bloqueo-cola.mjs [federación] [intentos]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'murcia';
const INTENTOS = Number(process.argv[3] ?? 30);

const ruta = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(ruta)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

// En lectura y escritura, pero sin tocar nada: sólo se pide y se suelta el bloqueo.
const db = new DatabaseSync(ruta, { timeout: 120_000 });

const esperas = [];
const lecturas = [];
let fallos = 0;

for (let i = 0; i < INTENTOS; i += 1) {
  // 1. El bloqueo de ESCRITURA (el que hace falta para marcar un trabajo y guardar un acta).
  let t = process.hrtime.bigint();
  try {
    db.exec('begin immediate');
    db.exec('rollback');
    esperas.push(Number(process.hrtime.bigint() - t) / 1e6);
  } catch {
    try { db.exec('rollback'); } catch { /* nada que deshacer */ }
    fallos += 1;
  }
  // 2. Una LECTURA (lo que hace `siguienteTrabajo`): en modo WAL no debería esperar nunca.
  t = process.hrtime.bigint();
  try {
    db.prepare('select count(*) n from trabajos').get();
    lecturas.push(Number(process.hrtime.bigint() - t) / 1e6);
  } catch { /* se omite */ }
}

db.close();

const resumen = (lista) => {
  const o = [...lista].sort((a, b) => a - b);
  return {
    mediana: o[Math.floor(o.length / 2)] ?? 0,
    media: o.reduce((a, b) => a + b, 0) / (o.length || 1),
    p95: o[Math.min(o.length - 1, Math.floor(0.95 * o.length))] ?? 0,
    max: o[o.length - 1] ?? 0,
    total: o.reduce((a, b) => a + b, 0),
  };
};

const e = resumen(esperas);
const l = resumen(lecturas);
const f = (n) => n.toFixed(1).padStart(8);

console.log(`cola de ${FEDERACION} · ${INTENTOS} intentos · sin modificar nada (begin immediate + rollback)\n`);
console.log('  operación                    mediana     media       p95       max     total');
console.log(`  pedir bloqueo de ESCRITURA ${f(e.mediana)} ${f(e.media)} ${f(e.p95)} ${f(e.max)} ${f(e.total)}`);
console.log(`  leer (como siguienteTrabajo)${f(l.mediana)} ${f(l.media)} ${f(l.p95)} ${f(l.max)} ${f(l.total)}`);
if (fallos) console.log(`  intentos fallidos: ${fallos}`);

console.log(`\n  Si «pedir bloqueo» sale en milisegundos, la espera del worker NO es por la cola y el tiempo de`);
console.log('  «analisis_guardado» está en otra parte. Si salen segundos, el que frena a los recolectores es');
console.log('  quien tiene la cola abierta — el importador —, y el arreglo no es optimizar el análisis.');

// Y de paso: ¿quién tiene la cola abierta AHORA? Son los ficheros WAL/SHM de SQLite, que existen mientras hay
// una conexión viva. No dice quién, pero sí que hay alguien.
import { statSync } from 'node:fs';
for (const sufijo of ['-wal', '-shm']) {
  const f2 = `${ruta}${sufijo}`;
  if (existsSync(f2)) {
    const s = statSync(f2);
    console.log(`  ${f2.split('/').pop()}: ${s.size} bytes, tocado hace `
      + `${Math.round((Date.now() - s.mtimeMs) / 1000)} s`);
  }
}
