#!/usr/bin/env node
/*
 * ── SINCRONIZACIÓN DE LA COLA COMÚN ──────────────────────────────────────────────────────────────────────
 *
 * El 26/11/2026 la cola compartida se cargó a mano desde la fusión. Eso no vale para la próxima federación:
 * en cuanto los recolectores encolan trabajo nuevo (descubrimientos, jornadas, actas), la cola común se queda
 * atrás y vuelve el problema de «tres colas, tres verdades».
 *
 * Este script cierra ese hueco. Cada 5 minutos:
 *   1. lee de las tres colas locales el trabajo **pendiente** que aún no está en `ops.cola` y lo inserta;
 *   2. lee el trabajo **hecho** y lo marca como hecho en `ops.cola` (deja de contar como pendiente);
 *   3. no toca lo que está en curso en otra máquina.
 *
 * Es idempotente: ejecutarlo dos veces seguidas no duplica nada.
 */
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const COLAS = [
  '/srv/data/facylf/descargas-federacion/recolector-local/cola-v2.sqlite',
  '/srv/data/facylf/descargas-federacion-2/recolector-local/cola-v2.sqlite',
  '/srv/data/facylf/descargas-federacion-3/recolector-local/cola-v2.sqlite',
];

/** Ejecuta SQL en Postgres y devuelve la salida. */
function psql(sql) {
  // La SQL va por entrada estándar: con miles de filas no cabe en la línea de órdenes (E2BIG).
  return execFileSync('docker', [
    'exec', '-i', 'facylf-postgres', 'psql', '-U', 'facylf_admin', '-d', 'facylf', '-At', '-F', '\t',
  ], { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Escapa un valor para SQL. */
const txt = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replaceAll("'", "''")}'`);

let insertados = 0;
let marcados = 0;

for (const ruta of COLAS) {
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
  } catch {
    continue; // cola que no existe (federación sin ese recolector)
  }

  // 1. Pendientes que aún no están en la cola común.
  const pendientes = db.prepare(`select clave, tipo, temporada, competicion, grupo, jornada, acta, url, prioridad
    from trabajos where estado in ('pendiente', 'bloqueado')`).all();
  if (pendientes.length > 0) {
    const valores = pendientes.map((f) => `(${txt(f.clave)}, ${txt(f.tipo)}, ${txt(f.temporada)},
      ${txt(f.competicion)}, ${txt(f.grupo)}, ${txt(f.jornada)}, ${txt(f.acta)}, ${txt(f.url)},
      ${Number(f.prioridad) || 0})`).join(',');
    const salida = psql(`insert into ops.cola (clave, tipo, temporada, competicion, grupo, jornada, acta, url, prioridad, estado)
      values ${valores} on conflict (clave) do nothing;`).trim();
    insertados += Number((salida.match(/INSERT 0 (\d+)/) ?? [0, 0])[1]) || 0;
  }

  // 2. Hechos: se marcan en la cola común para que dejen de contar como pendientes.
  const hechos = db.prepare(`select clave from trabajos where estado = 'hecho'`).all();
  if (hechos.length > 0) {
    const claves = hechos.map((f) => txt(f.clave)).join(',');
    psql(`update ops.cola set estado = 'hecho', actualizado_en = now()
      where clave in (${claves}) and estado <> 'hecho';`);
    marcados += hechos.length;
  }

  db.close();
}

const resumen = psql(`select estado, count(*) from ops.cola group by 1 order by 2 desc;`).trim().replaceAll('\n', ' ');
console.log(`sincronizada: ${insertados} nuevos · ${marcados} hechos revisados · ${resumen}`);
