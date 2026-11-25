#!/usr/bin/env node
/*
 * ── FUSIÓN DE LAS TRES COLAS EN UNA SOLA ──────────────────────────────────────────────────────────────────
 *
 * Diseño de Claude (25/11/2026) para dejar de tener tres copias que divergen: hoy las tres dan cifras
 * distintas del mismo trabajo (16.502, 19.089 y 21.960 jornadas pendientes) porque cada navegador lleva su
 * cuenta. Con una sola cola, cada trabajo existe una vez y su dueño se decide al reclamarlo.
 *
 * Este script NO toca las colas originales: lee las tres y escribe una cola nueva con:
 *   · una fila por CLAVE de trabajo (la clave ya identifica el trabajo: tipo|temporada|competición|grupo|jornada|acta);
 *   · el estado más avanzado de las tres (hecho gana a pendiente, que gana a en_curso);
 *   · columnas nuevas `dueno` y `alquiler_hasta` para el alquiler por competición.
 *
 * Uso:
 *   node fusiona-colas.mjs --salida /tmp/cola-unica.sqlite <cola1> <cola2> <cola3>
 */
import { DatabaseSync } from 'node:sqlite';

function arg(nombre, porDefecto = null) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i === -1 ? porDefecto : process.argv[i + 1];
}

const salida = arg('salida');
const entradas = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== salida);
if (!salida || entradas.length === 0) {
  console.error('uso: fusiona-colas.mjs --salida <cola-unica.sqlite> <cola1> <cola2> ...');
  process.exit(1);
}

const destino = new DatabaseSync(salida);
destino.exec(`
  drop table if exists trabajos;
  create table trabajos (
    clave text primary key,
    tipo text not null,
    temporada text,
    competicion text,
    grupo text,
    jornada text,
    acta text,
    url text,
    prioridad integer default 0,
    estado text not null default 'pendiente',
    intentos integer default 0,
    siguiente_intento text,
    ultimo_error text,
    creado_en text,
    actualizado_en text,
    dueno text,
    alquiler_hasta text
  );
  create index trabajos_estado on trabajos(estado, prioridad);
  create index trabajos_competicion on trabajos(temporada, competicion, estado);
`);

// El estado más avanzado gana: si una cola ya lo hizo, no se vuelve a hacer.
const rango = { hecho: 3, bloqueado: 2, en_curso: 1, pendiente: 1, cancelado: 0 };
const mejor = new Map();
for (const entrada of entradas) {
  const db = new DatabaseSync(`${entrada}/recolector-local/cola-v2.sqlite`, { readOnly: true });
  const filas = db.prepare(`select clave, tipo, temporada, competicion, grupo, jornada, acta, url,
      prioridad, estado, intentos, siguiente_intento, ultimo_error, creado_en, actualizado_en
    from trabajos`).all();
  for (const fila of filas) {
    const previa = mejor.get(fila.clave);
    if (!previa || (rango[fila.estado] ?? 0) > (rango[previa.estado] ?? 0)) mejor.set(fila.clave, fila);
  }
  db.close();
}

const inserta = destino.prepare(`insert into trabajos (clave, tipo, temporada, competicion, grupo, jornada, acta,
    url, prioridad, estado, intentos, siguiente_intento, ultimo_error, creado_en, actualizado_en)
  values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  on conflict(clave) do nothing`);
destino.exec('begin');
for (const f of mejor.values()) {
  inserta.run(f.clave, f.tipo, f.temporada, f.competicion, f.grupo, f.jornada, f.acta, f.url,
    f.prioridad ?? 0, f.estado, f.intentos ?? 0, f.siguiente_intento, f.ultimo_error, f.creado_en, f.actualizado_en);
}
destino.exec('commit');

const total = destino.prepare('select count(*) n from trabajos').get().n;
const pendientes = destino.prepare(`select count(*) n from trabajos where estado = 'pendiente' and tipo = 'jornada'
  and temporada in (select temporada from trabajos where estado = 'pendiente' group by 1)`).get().n;
const porEstado = destino.prepare('select estado, count(*) n from trabajos group by 1 order by 2 desc').all();

console.log(`fusión: ${entradas.length} colas → ${salida}`);
console.log(`  trabajos únicos: ${total}`);
console.log(`  por estado: ${porEstado.map((x) => `${x.estado}=${x.n}`).join(' ')}`);
console.log(`  jornadas pendientes (todas las temporadas): ${pendientes}`);
destino.close();
