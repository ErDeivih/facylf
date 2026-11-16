#!/usr/bin/env node
/*
 * ── FOTO DE UNA COLA DE RECOLECCIÓN (para medir idempotencia) ───────────────────────────────────────────
 *
 * La cola de cada federación es un SQLite con la **tabla de control de trabajos**: una fila por trabajo
 * (acta, jornada, grupo…) con su estado. `hecho` significa «ya descargado y guardado», y el recolector no
 * vuelve a pedirlo: eso es lo que hace idempotente a una segunda pasada.
 *
 * Este comando saca la foto de ese estado, sin escribir nada, para poder comparar antes/después:
 *
 *   node scripts/servidor/foto-idempotencia.mjs descargas-federacion/recolector-local/cola-v2.sqlite
 *   node scripts/servidor/foto-idempotencia.mjs <cola> --json
 *
 * Devuelve: trabajos por estado, peticiones acumuladas, actas y jornadas guardadas y la última actualización.
 * Comparando dos fotos se ve cuántos trabajos ha hecho la pasada y cuántos ha saltado por estar ya hechos.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const ruta = process.argv[2];
const json = process.argv.includes('--json');

if (!ruta || !existsSync(ruta)) {
  console.error(`No existe la cola: ${ruta ?? '(sin ruta)'}`);
  process.exit(1);
}

// `readOnly` no es cosmético: garantiza que una foto no puede cambiar el estado de la cola ni bloquear al
// worker que esté escribiendo (SQLite en WAL permite las dos cosas a la vez).
let db;
try {
  db = new DatabaseSync(ruta, { readOnly: true, timeout: 30_000 });
} catch (error) {
  console.error(`No se pudo abrir la cola en sólo lectura: ${error.message}`);
  process.exit(1);
}

const uno = (sql) => {
  try {
    return Object.values(db.prepare(sql).get() ?? {})[0] ?? 0;
  } catch {
    return null; // una cola antigua puede no tener alguna de las tablas: se informa como null
  }
};

const estados = {};
for (const fila of db.prepare('select estado, count(*) n from trabajos group by estado').all()) {
  estados[String(fila.estado)] = Number(fila.n);
}

const foto = {
  cola: ruta,
  cuando: new Date().toISOString(),
  trabajos: {
    hecho: estados.hecho ?? 0,
    pendiente: estados.pendiente ?? 0,
    en_curso: estados.en_curso ?? 0,
    cancelado: estados.cancelado ?? 0,
  },
  total_trabajos: Object.values(estados).reduce((a, b) => a + b, 0),
  peticiones: uno('select count(*) from peticiones'),
  actas: uno('select count(*) from actas'),
  jornadas: uno('select count(*) from jornadas'),
  ultima_actualizacion: uno('select max(actualizado_en) from trabajos'),
};
db.close();

if (json) {
  console.log(JSON.stringify(foto, null, 2));
} else {
  const t = foto.trabajos;
  console.log(`COLA ${ruta}`);
  console.log(`  ${foto.cuando}`);
  console.log(`  trabajos: ${foto.total_trabajos}  (hecho ${t.hecho} · pendiente ${t.pendiente} · en_curso ${t.en_curso} · cancelado ${t.cancelado})`);
  console.log(`  peticiones: ${foto.peticiones} · actas: ${foto.actas} · jornadas: ${foto.jornadas}`);
  console.log(`  última actualización: ${foto.ultima_actualizacion ?? '—'}`);
}
