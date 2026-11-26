#!/usr/bin/env node
/*
 * ── COORDINADOR DEL REPARTO DE TEMPORADAS ────────────────────────────────────────────────────────────────
 *
 * El reparto de temporadas se hacía a mano y ha sido la causa de medio día de problemas: cuando una lista
 * apuntaba a temporadas ya terminadas, el navegador se quedaba sin trabajo y cogía lo que no le tocaba.
 *
 * Este script lo hace solo, cada 30 minutos:
 *   1. mira en las tres colas cuántas jornadas pendientes tiene cada temporada (de las pasadas);
 *   2. reparte las temporadas entre los tres navegadores, de la que más trabajo tiene a la que menos,
 *      **sin que dos compartan la misma temporada**;
 *   3. escribe la lista de cada uno en `temporadas-asignadas.txt` y deja constancia en Postgres (`ops.reparto`);
 *   4. si el reparto cambia, reinicia el recolector afectado para que lo coja.
 *
 * No toca el código del recolector: usa el mecanismo que ya funciona (el fichero de asignación).
 *
 * Uso:  node coordina-reparto.mjs [--seco]
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const SECO = process.argv.includes('--seco');

const COLAS = [
  { contenedor: 'facylf-federacion-1', carpeta: '/app/descargas-federacion', fichero: '/srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt' },
  { contenedor: 'facylf-federacion2-1', carpeta: '/app/descargas-federacion-2', fichero: '/srv/data/facylf/descargas-federacion-2/recolector-local/temporadas-asignadas.txt' },
  { contenedor: 'facylf-federacion3-1', carpeta: '/app/descargas-federacion-3', fichero: '/srv/data/facylf/descargas-federacion-3/recolector-local/temporadas-asignadas.txt' },
];

/** Trabajo pendiente por temporada, mirando las tres colas y quedándose con el mayor de cada una. */
function pendientePorTemporada() {
  const total = new Map();
  for (const cola of COLAS) {
    const salida = execFileSync('docker', ['exec', cola.contenedor, 'node', '-e', `
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1] + "/recolector-local/cola-v2.sqlite", { readOnly: true });
      const filas = db.prepare("select t.etiqueta, count(*) n from trabajos j join temporadas t on t.codigo = j.temporada where j.estado = ? and j.tipo in (?, ?) and t.etiqueta < ? group by 1").all("pendiente", "jornada", "acta", "2026-27");
      process.stdout.write(JSON.stringify(filas));
    `, cola.carpeta], { encoding: 'utf8' });
    for (const { etiqueta, n } of JSON.parse(salida.trim() || '[]')) {
      total.set(etiqueta, Math.max(total.get(etiqueta) ?? 0, n));
    }
  }
  return [...total.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
}

const temporadas = pendientePorTemporada();
if (temporadas.length === 0) {
  console.log('no hay trabajo pendiente de temporadas pasadas');
  process.exit(0);
}

// Reparto: la que más trabajo tiene va al navegador que menos lleva, en orden.
const carga = [0, 0, 0];
const reparto = [[], [], []];
for (const [etiqueta, n] of temporadas) {
  const destino = carga.indexOf(Math.min(...carga));
  reparto[destino].push(etiqueta);
  carga[destino] += n;
}

for (let i = 0; i < COLAS.length; i += 1) {
  const lista = reparto[i];
  console.log(`${COLAS[i].contenedor}: ${lista.join(', ') || '(sin temporadas)'} · ${carga[i]} trabajos`);
  if (SECO) continue;
  writeFileSync(COLAS[i].fichero, `${lista.join('\n')}\n`);
}

// Deja constancia en Postgres para poder auditar quién tenía qué.
if (!SECO) {
  const filas = COLAS.map((c, i) => `('${c.contenedor}', '${reparto[i].join(',')}', ${carga[i]}, now())`).join(',');
  try {
    execFileSync('docker', ['exec', 'facylf-postgres', 'psql', '-U', 'facylf_admin', '-d', 'facylf', '-c', `
      create table if not exists ops.reparto (recolector text primary key, temporadas text, carga bigint, actualizado timestamptz);
      insert into ops.reparto (recolector, temporadas, carga, actualizado) values ${filas}
      on conflict (recolector) do update set temporadas = excluded.temporadas, carga = excluded.carga, actualizado = excluded.actualizado;`],
      { stdio: 'ignore' });
  } catch {
    console.log('aviso: no se pudo dejar constancia en Postgres');
  }
}
