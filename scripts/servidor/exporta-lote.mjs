#!/usr/bin/env node
/*
 * ── EXPORTADOR DE LOTES PARA EL VPS ─────────────────────────────────────────────────────────────────────
 *
 * Diseño acordado con Claude (18/11/2026): el servidor no escribe directo en la base del VPS (si la red
 * falla, la ingesta se bloquea). En vez de eso genera **lotes incrementales** que se envían después:
 *
 *   1. Lee del canónico sólo las filas con `id` mayor que la última exportada, por tabla.
 *   2. Las saca con `COPY ... TO STDOUT`, en CSV comprimido.
 *   3. Escribe un `manifiesto.json` por lote: tablas, filas, sha256 de cada fichero y la marca de corte.
 *   4. La marca de lo exportado **sólo avanza cuando el lote se da por bueno** (`--confirmar`), no al
 *      generarlo. Así un lote que no llegue se puede repetir sin perder nada.
 *
 * El envío (rsync por Tailscale) y la carga en el VPS (`COPY` a una tabla de staging + `INSERT ... ON
 * CONFLICT DO NOTHING`) los hace el receptor; aquí sólo se generan y verifican los lotes.
 *
 * Uso (dentro del contenedor del importador, que ve el canónico y /app/estado):
 *   node scripts/servidor/exporta-lote.mjs --destino /tmp/lotes [--limite 50000] [--seco]
 *   node scripts/servidor/exporta-lote.mjs --confirmar <idDelLote>   # marca el lote como exportado
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

/** Tablas que se exportan, en orden. Sólo las que la web necesita. */
export const TABLAS = Object.freeze([
  'core.season', 'core.federation', 'core.club', 'core.team_season', 'core.competition_edition',
  'core.phase_group', 'core.team_entry', 'core.matchday', 'core.venue', 'core.match',
  'core.match_official', 'core.match_event', 'core.match_staff', 'core.club_asset',
  'core.person', 'core.person_asset', 'core.person_source_identity', 'core.appearance',

]);

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

/** Estado: última id exportada por tabla y lotes pendientes de confirmar. */
export function estadoVacio() {
  return { version: 1, ultima: {}, lotes: {} };
}

export function leeEstado(ruta) {
  if (!existsSync(ruta)) return estadoVacio();
  try {
    const e = JSON.parse(readFileSync(ruta, 'utf8'));
    return { version: 1, ultima: e.ultima ?? {}, lotes: e.lotes ?? {} };
  } catch {
    return estadoVacio();
  }
}

export function guardaEstado(ruta, estado) {
  const tmp = `${ruta}.tmp`;
  writeFileSync(tmp, JSON.stringify(estado, null, 2));
  renameSync(tmp, ruta);
}

/** El id del lote es la marca de corte: sirve para confirmarlo después. */
export function idDeLote(fecha = new Date()) {
  return fecha.toISOString().replace(/[:.]/g, '-');
}

/** Une el manifiesto de un lote a partir de los ficheros y los recuentos. */
export function manifiestoDeLote({ id, cuando, tablas, corte }) {
  return { id, cuando, corte, tablas };
}

function psql(contenedor, sql) {
  return execFileSync('docker', ['exec', '-i', contenedor, 'psql', '-U', 'facylf_admin', '-d', 'facylf', '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function copia(contenedor, sql, destino) {
  const stdout = execFileSync('docker', ['exec', '-i', contenedor, 'psql', '-U', 'facylf_admin', '-d', 'facylf', '-c', sql],
    { maxBuffer: 256 * 1024 * 1024 });
  writeFileSync(destino, stdout);
  return createHash('sha256').update(stdout).digest('hex');
}

function main() {
  const seco = process.argv.includes('--seco');
  const confirmar = arg('confirmar');
  const destino = arg('destino', '/tmp/lotes');
  const limite = Number(arg('limite', 50000));
  const contenedor = arg('contenedor', 'facylf-postgres');
  const rutaEstado = arg('estado', '/app/estado/exportacion.json');

  const estado = leeEstado(rutaEstado);

  if (confirmar) {
    const lote = estado.lotes[confirmar];
    if (!lote) { console.error(`No existe el lote ${confirmar}`); process.exit(1); }
    for (const [tabla, datos] of Object.entries(lote.tablas)) estado.ultima[tabla] = datos.hasta;
    delete estado.lotes[confirmar];
    guardaEstado(rutaEstado, estado);
    console.log(JSON.stringify({ confirmado: confirmar, ultima: estado.ultima }));
    return;
  }

  const id = idDeLote();
  const cuando = new Date().toISOString();
  const tablas = {};
  let totalFilas = 0;
  if (!seco) mkdirSync(destino, { recursive: true });

  for (const tabla of TABLAS) {
    const desde = Number(estado.ultima[tabla] ?? 0);
    const fila = psql(contenedor, `select count(*), max(id) from (select id from ${tabla} where id > ${desde} order by id limit ${limite}) x`).trim();
    const [filasTexto, hastaTexto] = fila.split('|');
    const filas = Number(filasTexto ?? 0);
    if (!filas) continue;
    const hasta = Number(hastaTexto);
    const fichero = join(destino, `${id}-${tabla.replace('.', '_')}.csv`);
    let sha = null;
    if (!seco) {
      sha = copia(contenedor, `copy (select * from ${tabla} where id > ${desde} and id <= ${hasta} order by id) to stdout with (format csv, header true)`, fichero);
    }
    tablas[tabla] = { desde, hasta, filas, fichero: seco ? null : fichero, sha256: sha };
    totalFilas += filas;
  }

  const manifiesto = manifiestoDeLote({ id, cuando, tablas, corte: { desde: estado.ultima, hasta: Object.fromEntries(Object.entries(tablas).map(([t, d]) => [t, d.hasta])) } });
  if (!seco && totalFilas > 0) {
    writeFileSync(join(destino, `${id}-manifiesto.json`), JSON.stringify(manifiesto, null, 2));
    estado.lotes[id] = manifiesto;
    guardaEstado(rutaEstado, estado);
  }
  console.log(JSON.stringify({ id, seco, tablas: Object.keys(tablas).length, filas: totalFilas, manifiesto: seco ? null : join(destino, `${id}-manifiesto.json`) }));
}

if (process.argv[1]?.endsWith('exporta-lote.mjs')) {
  try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
