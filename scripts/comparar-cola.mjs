#!/usr/bin/env node
/**
 * Compara el CONTENIDO LÓGICO de `partidos` entre dos SQLite.
 *
 * Compara las filas, no el tamaño ni la fecha del fichero: dos bases pueden pesar distinto y tener los
 * mismos hechos (por el WAL, por la fragmentación, por el orden físico) y dos bases pueden pesar igual y
 * tener hechos distintos. Se excluye `actualizado_en` a propósito: la marca la escribe la propia
 * herramienta, así que incluirla haría que un lote y su reversión nunca coincidieran aunque los hechos
 * fueran idénticos.
 *
 * Uso: node scripts/comparar-cola.mjs <a.sqlite> <b.sqlite>
 */
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('Uso: comparar-cola <a.sqlite> <b.sqlite>');
  process.exit(1);
}

function huellaLogica(ruta) {
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const h = createHash('sha256');
    let filas = 0;
    // `iterate()` mantiene una fila en memoria, no las 34.358.
    for (const f of db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
        equipo_local_codigo, equipo_visitante_codigo, local, visitante, goles_local, goles_visitante,
        fecha, hora, campo, campo_codigo, arbitro
      from partidos order by temporada, competicion, grupo, jornada, orden`).iterate()) {
      h.update(JSON.stringify(f));
      h.update('\n');
      filas++;
    }
    const tablas = db.prepare("select name from sqlite_master where type='table' order by name").all().map((t) => t.name);
    return { huella: h.digest('hex'), filas, tablas };
  } finally { db.close(); }
}

const ha = huellaLogica(a);
const hb = huellaLogica(b);
const iguales = ha.huella === hb.huella && ha.filas === hb.filas;
console.log(`A ${a}`);
console.log(`  huella lógica ${ha.huella.slice(0, 24)}… · ${ha.filas} filas`);
console.log(`B ${b}`);
console.log(`  huella lógica ${hb.huella.slice(0, 24)}… · ${hb.filas} filas`);
console.log(iguales ? 'IGUALES: el contenido lógico coincide' : 'DISTINTAS: el contenido lógico NO coincide');
// El esquema también: un lote no puede añadir ni quitar tablas a la cola del worker.
if (ha.tablas.join(',') !== hb.tablas.join(',')) {
  console.log(`  OJO: el esquema cambió\n    A: ${ha.tablas.join(', ')}\n    B: ${hb.tablas.join(', ')}`);
  process.exit(1);
}
process.exit(iguales ? 0 : 1);
