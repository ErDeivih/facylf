#!/usr/bin/env node
// PRIORIZA LAS ACTAS (David, 23/10/2026: «prioriza actas, para todas las federaciones; pero para obtener las
// actas hay que conocer la jornada»).
//
// Cómo encaja sin romper nada: el recolector elige el siguiente trabajo con
//   order by prioridad, temporada desc, case when tipo='acta' then 0 else 1 end, creado_en
// (`scripts/lib/recolector-local.mjs`), y las tareas de DESCUBRIMIENTO (catálogo de temporada, grupos, índice de
// jornadas, calendario) llevan prioridades entre -2.000.000.000 y -1.400.000.000: ésas son las que «conocen la
// jornada» y siguen yendo primero. Lo que se hace aquí es meter TODOS los trabajos de tipo `acta` pendientes en
// una banda fija por encima de las jornadas normales (-1.399.000.000): primero se conoce lo que falta, luego se
// bajan las actas de lo conocido, y sólo después se siguen leyendo jornadas.
//
// Es idempotente (si ya están en la banda, no hace nada) y deja una copia de las prioridades de antes junto a la
// cola (`cola-v2-prioridades-acta-<fecha>.json`), para poder volver atrás.
//
// Uso:
//   node scripts/claude/prioriza-actas.mjs                 → simulación de todas las colas del PC
//   node scripts/claude/prioriza-actas.mjs --aplicar       → aplica en las colas del PC
//   node scripts/claude/prioriza-actas.mjs --aplicar /ruta/cola-v2.sqlite [/otra/cola-v2.sqlite ...]
//   (en el servidor se pasan a mano las rutas /srv/ssd/facylf/<fed>/cola-v2.sqlite)
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';

const BANDA = -1_399_000_000;
const argumentos = process.argv.slice(2);
const aplicar = argumentos.includes('--aplicar');
const dadas = argumentos.filter((a) => !a.startsWith('--'));
const PENDIENTES = "estado in ('pendiente','bloqueado')";

function colas() {
  if (dadas.length) return dadas;
  const raiz = process.env.FACYLF_RAIZ ?? process.cwd();
  return readdirSync(raiz)
    .filter((d) => d.startsWith('descargas-'))
    .map((d) => join(raiz, d, 'recolector-local', 'cola-v2.sqlite'))
    .filter((p) => existsSync(p));
}

const SIGUIENTE = `select tipo, temporada, prioridad from trabajos
  where ${PENDIENTES} and (siguiente_intento is null or siguiente_intento <= ?)
  order by prioridad, coalesce(cast(temporada as integer), -1) desc,
    case when tipo='acta' then 0 else 1 end, creado_en limit 3`;

let total = 0;
for (const ruta of colas()) {
  // La cola puede estar en `descargas-<fed>/recolector-local/cola-v2.sqlite` (PC) o en
  // `/srv/ssd/facylf/<fed>/cola-v2.sqlite` (servidor): en los dos casos, la carpeta que la nombra es la anterior.
  const carpeta = dirname(ruta);
  const nombre = basename(carpeta).endsWith('recolector-local') ? basename(dirname(carpeta)) : basename(carpeta).replace(/^descargas-/, '');
  const db = new DatabaseSync(ruta);
  db.exec('pragma busy_timeout = 20000');
  const ahora = new Date().toISOString();
  const fuera = db.prepare(`select count(*) n from trabajos where tipo='acta' and ${PENDIENTES} and prioridad <> ?`).get(BANDA).n;
  const actas = db.prepare(`select count(*) n from trabajos where tipo='acta' and ${PENDIENTES}`).get().n;
  const todos = db.prepare(`select count(*) n from trabajos where ${PENDIENTES}`).get().n;
  if (!fuera) {
    console.log(`${nombre.padEnd(22)} ${String(actas).padStart(6)} actas pendientes, ya en la banda · nada que hacer`);
    db.close();
    continue;
  }
  console.log(`${nombre.padEnd(22)} ${String(actas).padStart(6)} actas pendientes de ${todos} · ${fuera} fuera de la banda`);
  if (aplicar) {
    const antes = db.prepare(`select clave, prioridad from trabajos where tipo='acta' and ${PENDIENTES}`).all();
    const copia = join(dirname(ruta), `cola-v2-prioridades-acta-${ahora.slice(0, 10)}.json`);
    writeFileSync(copia, JSON.stringify(antes));
    const cambios = db.prepare(`update trabajos set prioridad = ?, actualizado_en = ? where tipo='acta' and ${PENDIENTES} and prioridad <> ?`).run(BANDA, ahora, BANDA);
    console.log(`${''.padEnd(22)} aplicado a ${cambios.changes} trabajos · copia en ${basename(copia)}`);
    total += cambios.changes;
  }
  const siguientes = db.prepare(SIGUIENTE).all(ahora);
  console.log(`${''.padEnd(22)} los 3 siguientes: ${siguientes.map((s) => `${s.tipo}(${s.temporada ?? '-'})`).join(' · ')}`);
  db.close();
}
console.log(aplicar ? `\n${total} trabajos de acta recolocados en la banda ${BANDA}.` : '\n(simulación: añade --aplicar para hacerlo)');
