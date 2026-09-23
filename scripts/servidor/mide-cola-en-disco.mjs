#!/usr/bin/env node
/*
 * ── ¿CUÁNTO CUESTA ESCRIBIR EN LA COLA, EN EL DISCO DURO Y EN EL SSD? ─────────────────────────────────────
 *
 * La medición por fases de Murcia (23/09/2026) reparte así el ciclo de un acta: 3 s de portal y **~4-7 s de
 * disco** (escribir el HTML, escribir el JSON y las escrituras en SQLite). El análisis del acta son 30 ms, o
 * sea que no es eso.
 *
 * Las colas viven en `/srv/data`, que es un **disco DURO**, y ahí escriben a la vez 19 recolectores y el
 * importador. El sistema (`/`) es un **SSD**. La pregunta que decide el arreglo es sencilla:
 *
 *     ¿la misma escritura cuesta lo mismo en los dos discos?
 *
 * Y para responderla hay que medirla donde importa: no escribiendo un fichero suelto, sino haciendo **lo que
 * hace el recolector en cada trabajo** — abrir transacción, marcar el trabajo en curso, anotar el archivo en
 * `archivos` y cerrar — sobre una cola REAL.
 *
 * Se trabaja SIEMPRE sobre copias hechas con `VACUUM INTO` desde una conexión de sólo lectura, así que la cola
 * viva no se toca y los dos discos reciben exactamente los mismos datos. La copia sale limpia y compacta, que
 * además quita el ruido de la fragmentación.
 *
 * Uso (dentro de un contenedor):
 *   docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *     /app/scripts/servidor/mide-cola-en-disco.mjs [federación] [repeticiones]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const FEDERACION = process.argv[2] ?? 'murcia';
const REPETICIONES = Number(process.argv[3] ?? 40);

const origen = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'cola-v2.sqlite');
if (!existsSync(origen)) {
  console.error(`no existe la cola de ${FEDERACION}`);
  process.exit(2);
}

// El disco DURO donde vive de verdad la cola, y el SSD del sistema.
const CARPETA_DURO = join(RAIZ, `descargas-${FEDERACION}`, 'recolector-local', 'tmp-bench-cola');
const CARPETA_SSD = '/tmp/bench-cola';
for (const c of [CARPETA_DURO, CARPETA_SSD]) {
  try { mkdirSync(c, { recursive: true }); } catch { /* se verá al copiar */ }
}
const copiaDuro = join(CARPETA_DURO, 'cola-copia.sqlite');
const copiaSsd = join(CARPETA_SSD, 'cola-copia.sqlite');

/**
 * Copia la cola con `VACUUM INTO` desde una conexión de SÓLO LECTURA.
 *
 * Es la forma limpia de copiar una SQLite viva: no hace falta parar al recolector, la copia sale íntegra y
 * compacta, y el original no se modifica. `cp` a secas sobre una base que se está escribiendo deja un fichero
 * corrupto (está documentado en las reglas del servidor).
 */
function copia(destino) {
  try { rmSync(destino, { force: true }); } catch { /* no existía */ }
  const lectura = new DatabaseSync(origen, { readOnly: true, timeout: 30_000 });
  lectura.exec(`vacuum into '${destino}'`);
  lectura.close();
  return statSync(destino).size;
}

let bytes = 0;
try {
  bytes = copia(copiaDuro);
  copia(copiaSsd);
} catch (error) {
  console.error(`no se pudo copiar la cola: ${error.message}`);
  process.exit(1);
}
console.log(`cola de ${FEDERACION} · copia de ${(bytes / 1024 / 1024).toFixed(1)} MB en los dos discos\n`);

/** La secuencia de escritura que hace el recolector en CADA trabajo, cronometrada entera. */
function mide(copia, etiqueta) {
  const db = new DatabaseSync(copia, { timeout: 60_000 });
  db.exec('pragma journal_mode = WAL; pragma busy_timeout = 60000;');

  // Se usan claves REALES de la cola para que los índices de `trabajos` trabajen como en producción.
  const claves = db.prepare('select clave from trabajos limit 200').all().map((f) => f.clave);
  if (!claves.length) {
    db.close();
    return null;
  }

  const marcar = db.prepare("update trabajos set estado='en_curso',actualizado_en=? where clave=?");
  const archivar = db.prepare(`insert into archivos(ruta,tipo,hash,bytes,guardado_en)
    values(?,?,?,?,?) on conflict(ruta) do update set tipo=excluded.tipo,hash=excluded.hash,
    bytes=excluded.bytes,guardado_en=excluded.guardado_en`);

  const tiempos = [];
  for (let i = 0; i < REPETICIONES; i += 1) {
    const clave = claves[i % claves.length];
    const ahora = new Date().toISOString();
    const t = process.hrtime.bigint();
    try {
      db.exec('begin immediate');
      marcar.run(ahora, clave);
      archivar.run(`${etiqueta}/acta-${i}.html.gz`, 'acta', 'hash-de-prueba', 22000, ahora);
      db.exec('commit');
      tiempos.push(Number(process.hrtime.bigint() - t) / 1e6);
    } catch (error) {
      try { db.exec('rollback'); } catch { /* nada que deshacer */ }
      tiempos.push(-1);
    }
  }
  db.close();
  return tiempos.filter((t) => t >= 0);
}

const resumen = (lista) => {
  const o = [...lista].sort((a, b) => a - b);
  const suma = o.reduce((a, b) => a + b, 0);
  return {
    mediana: o[Math.floor(o.length / 2)],
    media: suma / o.length,
    p95: o[Math.min(o.length - 1, Math.floor(0.95 * o.length))],
    max: o[o.length - 1],
    total: suma,
  };
};

const duro = mide(copiaDuro, 'duro');
const ssd = mide(copiaSsd, 'ssd');

const f = (n) => (n === undefined || n === null ? '   —' : n.toFixed(1).padStart(8));
console.log(`  «escribir un trabajo» = begin immediate + marcar + anotar archivo + commit · ${REPETICIONES} intentos`);
console.log('  disco                        mediana     media       p95       max     total');
for (const [nombre, r] of [['/srv/data (DURO)', duro], ['/ (SSD, en /tmp)', ssd]]) {
  if (!r || !r.length) { console.log(`  ${nombre.padEnd(26)} (sin datos)`); continue; }
  const s = resumen(r);
  console.log(`  ${nombre.padEnd(26)} ${f(s.mediana)} ${f(s.media)} ${f(s.p95)} ${f(s.max)} ${f(s.total)}`);
}

if (duro?.length && ssd?.length) {
  const md = resumen(duro).mediana;
  const ms = resumen(ssd).mediana;
  const veces = ms > 0 ? md / ms : Infinity;
  console.log(`\n  El mismo trabajo cuesta ${veces.toFixed(1)}× más en el disco duro que en el SSD `
    + `(mediana ${md.toFixed(1)} ms frente a ${ms.toFixed(1)} ms).`);
  console.log('  Si la diferencia es grande, mover las colas al SSD es la palanca: la medición por fases dice');
  console.log('  que las escrituras se llevan más de la mitad del ciclo de cada trabajo.');
}

// Y se limpia: esto es un instrumento, no un residuo.
for (const c of [CARPETA_DURO, CARPETA_SSD]) {
  try { rmSync(c, { recursive: true, force: true }); } catch { /* nada que borrar */ }
}
