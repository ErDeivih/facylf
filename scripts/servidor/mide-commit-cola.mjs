#!/usr/bin/env node
/*
 * ── ¿CUÁNTO CUESTA CONFIRMAR UNA ESCRITURA EN ESTE DISCO? ────────────────────────────────────────────────
 *
 * La medición por fases de Murcia (23/09/2026) dice que el 60 % del ciclo de un trabajo son escrituras, y que
 * `acta_estructura` sola son 2,72 s. Mirando el código, por cada acta hay VARIAS escrituras que se confirman
 * por separado: el `upsert` en `archivos` del HTML, el del JSON, la transacción de `guardaActaEstructura`,
 * `reconciliaEnlaceActa` y el `update actas`.
 *
 * Eso importa porque SQLite, en modo WAL con `synchronous = FULL` (el valor por defecto de la biblioteca),
 * **sincroniza el disco en CADA confirmación**. Y en un disco DURO compartido por 19 recolectores y el
 * importador, un `fsync` no cuesta lo que cuesta en un SSD.
 *
 * Este programa mide exactamente eso, con una base de usar y tirar (nunca toca una cola de verdad):
 *
 *   1. una fila por confirmación      → lo que pasa hoy cuando cada escritura va suelta;
 *   2. muchas filas en UNA confirmación → lo que pasaría agrupando las escrituras del acta;
 *   3. lo mismo en el SSD, para saber cuánto de esto es el disco y cuánto es SQLite.
 *
 * Y con `synchronous = FULL` y `NORMAL`, porque de ahí sale la decisión: agrupar no cambia la durabilidad,
 * pero bajar de FULL a NORMAL sí, y eso es una decisión del responsable.
 *
 * Usa: docker run --rm -v /srv/data/facylf:/app --entrypoint node facylf-recolectores:local \
 *        /app/scripts/servidor/mide-commit-cola.mjs [confirmaciones] [filas_por_lote]
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const CONFIRMACIONES = Number(process.argv[2] ?? 25);
const FILAS_LOTE = Number(process.argv[3] ?? 400);

const CARPETA_DURO = join(RAIZ, 'estado', 'tmp-bench-commit');
const CARPETA_SSD = '/tmp/bench-commit';

const resumen = (lista) => {
  if (!lista.length) return null;
  const o = [...lista].sort((a, b) => a - b);
  return {
    mediana: o[Math.floor(o.length / 2)],
    media: o.reduce((a, b) => a + b, 0) / o.length,
    max: o[o.length - 1],
  };
};

/**
 * Mide sobre una base nueva en la carpeta indicada. Devuelve los tiempos de cada configuración.
 *
 * `sincrono` es el PRAGMA `synchronous`: `FULL` (2) sincroniza en cada confirmación; `NORMAL` (1) deja que lo
 * haga el sistema operativo, que en WAL es seguro frente a la caída del proceso pero puede perder las últimas
 * confirmaciones si se va la luz. Es la diferencia entre «no se pierde nada» y «no se corrompe nada».
 */
function mide(carpeta, etiqueta) {
  const resultados = {};
  for (const sincrono of ['FULL', 'NORMAL']) {
    try {
      mkdirSync(carpeta, { recursive: true });
      const ruta = join(carpeta, `bench-${sincrono}.sqlite`);
      rmSync(ruta, { force: true });
      const db = new DatabaseSync(ruta);
      db.exec(`pragma journal_mode = WAL;
        pragma synchronous = ${sincrono};
        create table prueba (id integer primary key, texto text not null, numero integer not null);
        create index prueba_numero on prueba(numero);`);

      const inserta = db.prepare('insert into prueba(texto,numero) values(?,?)');

      // 1. Una fila por confirmación. Es el patrón de hoy: cada escritura suelta paga su fsync.
      const sueltas = [];
      for (let i = 0; i < CONFIRMACIONES; i += 1) {
        const t = process.hrtime.bigint();
        inserta.run(`suelta-${i}`, i); // sin transacción explícita: autocommit = una confirmación
        sueltas.push(Number(process.hrtime.bigint() - t) / 1e6);
      }

      // 2. Muchas filas en UNA confirmación. Es lo que se gana agrupando las escrituras de un acta.
      const lotes = [];
      for (let i = 0; i < CONFIRMACIONES; i += 1) {
        const t = process.hrtime.bigint();
        db.exec('begin immediate');
        for (let j = 0; j < FILAS_LOTE; j += 1) inserta.run(`lote-${i}-${j}`, j);
        db.exec('commit');
        lotes.push(Number(process.hrtime.bigint() - t) / 1e6);
      }

      db.close();
      rmSync(ruta, { force: true });
      rmSync(`${ruta}-wal`, { force: true });
      rmSync(`${ruta}-shm`, { force: true });
      resultados[sincrono] = { sueltas, lotes };
    } catch (error) {
      resultados[sincrono] = { error: error.message.slice(0, 70) };
    }
  }
  return { etiqueta, resultados };
}

const duro = mide(CARPETA_DURO, '/srv/data (DURO)');
const ssd = mide(CARPETA_SSD, '/ (SSD, en /tmp)');

const f = (n) => (n === undefined || n === null ? '     —' : n.toFixed(1).padStart(8));

console.log(`confirmaciones medidas por configuración: ${CONFIRMACIONES} · filas por lote: ${FILAS_LOTE}\n`);
for (const { etiqueta, resultados } of [duro, ssd]) {
  console.log(`══ ${etiqueta} ══`);
  console.log('  synchronous   1 fila = 1 confirmación       ' + `${FILAS_LOTE} filas = 1 confirmación`);
  console.log('                mediana   media     max        mediana   media     max');
  for (const sincrono of ['FULL', 'NORMAL']) {
    const r = resultados[sincrono];
    if (!r || r.error) { console.log(`  ${sincrono.padEnd(12)} (${r?.error ?? 'sin datos'})`); continue; }
    const s = resumen(r.sueltas);
    const l = resumen(r.lotes);
    console.log(`  ${sincrono.padEnd(12)} ${f(s.mediana)} ${f(s.media)} ${f(s.max)}    `
      + `${f(l.mediana)} ${f(l.media)} ${f(l.max)}`);
  }
  console.log('');
}

console.log('  Lectura: si «1 fila = 1 confirmación» con FULL tarda decenas o cientos de milisegundos por fila y');
console.log('  con NORMAL baja mucho, el coste no es escribir: es SINCRONIZAR el disco en cada confirmación.');
console.log('  Y si agrupar en una sola confirmación sale casi gratis, agrupar las escrituras de un acta es la');
console.log('  palanca que no cambia dónde viven los datos ni su durabilidad.');

for (const c of [CARPETA_DURO, CARPETA_SSD]) {
  try { rmSync(c, { recursive: true, force: true }); } catch { /* nada que borrar */ }
}
