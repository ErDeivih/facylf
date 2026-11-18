#!/usr/bin/env node
/*
 * ── CARGA DE UN LOTE EN EL DESTINO (EL OTRO LADO DEL EXPORTADOR) ──────────────────────────────────────
 *
 * Carga un lote generado por `exporta-lote.mjs` en un Postgres con el MISMO esquema que el origen. Es lo
 * que ejecutará el VPS cuando exista, y sirve también para probar el control de duplicados aquí.
 *
 * Cómo evita duplicados:
 *   1. Cada lote tiene su manifiesto con el sha256 de cada CSV. Se comprueba antes de tocar nada.
 *   2. El lote se registra en `ops.lote_cargado`. Si ya está, **no se carga** y se sale con 0.
 *   3. La carga va dentro de una transacción: staging (tabla temporal copiada de la definitiva) + INSERT
 *      ... ON CONFLICT (id) DO UPDATE. Los `id` son los del servidor, así que un lote repetido actualiza
 *      las mismas filas en vez de crear otras.
 *
 * Uso:
 *   node scripts/servidor/carga-lote.mjs --lote <carpeta> --host <destino> [--usuario facylf_admin]
 *        [--base facylf] [--seco]
 *
 * El destino se indica con un contenedor de Docker (`--contenedor`) o con `docker exec` desde el host,
 * igual que el exportador: aquí no se inventa una conexión nueva.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (n, d = null) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

/** Tablas que se cargan, en el orden que respeta las claves foráneas. */
export const ORDEN = Object.freeze([
  'core.season', 'core.federation', 'core.club', 'core.team_season', 'core.competition_edition',
  'core.phase_group', 'core.team_entry', 'core.matchday', 'core.venue', 'core.match',
  'core.match_official', 'core.match_event', 'core.match_staff', 'core.club_asset',
  'core.person', 'core.person_asset', 'core.person_source_identity', 'core.appearance',
]);

/** Comprueba el manifiesto: cada CSV tiene que existir y cuadrar con su sha256. */
export function verificaManifiesto(carpeta) {
  const ficheros = readFileSync(join(carpeta, 'manifiesto.json'), 'utf8');
  const m = JSON.parse(ficheros);
  const fallos = [];
  for (const [tabla, datos] of Object.entries(m.tablas)) {
    if (!existsSync(datos.fichero)) { fallos.push(`${tabla}: falta el fichero`); continue; }
    const sha = createHash('sha256').update(readFileSync(datos.fichero)).digest('hex');
    if (sha !== datos.sha256) fallos.push(`${tabla}: sha256 no coincide`);
  }
  return { manifiesto: m, fallos };
}

function psql(contenedor, usuario, base, sql) {
  return execFileSync('docker', ['exec', '-i', contenedor, 'psql', '-U', usuario, '-d', base, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function main() {
  const carpeta = arg('lote');
  const contenedor = arg('contenedor', 'facylf-postgres');
  const usuario = arg('usuario', 'facylf_admin');
  const base = arg('base', 'facylf');
  const seco = process.argv.includes('--seco');
  if (!carpeta || !existsSync(carpeta)) { console.error('Falta --lote <carpeta>'); process.exit(1); }

  const { manifiesto, fallos } = verificaManifiesto(carpeta);
  if (fallos.length) { console.error(`✗ ${fallos.join(' · ')}`); process.exit(1); }
  const id = manifiesto.id;

  if (seco) { console.log(JSON.stringify({ id, seco, tablas: Object.keys(manifiesto.tablas).length })); return; }

  // Registro de lotes cargados: si ya está, no se vuelve a cargar.
  psql(contenedor, usuario, base, `create table if not exists ops.lote_cargado (
    lote text primary key, cuando timestamptz not null default now(), ficheros int, filas bigint, manifiesto jsonb)`);
  const ya = psql(contenedor, usuario, base, `select count(*) from ops.lote_cargado where lote = '${id}'`).trim();
  if (Number(ya) > 0) { console.log(JSON.stringify({ id, saltado: true, motivo: 'el lote ya estaba cargado' })); return; }

  const filas = Object.values(manifiesto.tablas).reduce((a, d) => a + d.filas, 0);
  const sentencias = ['begin;', 'set local statement_timeout = 0;'];
  for (const tabla of ORDEN) {
    const datos = manifiesto.tablas[tabla];
    if (!datos) continue;
    const temporal = `st_${tabla.replace('.', '_')}`;
    // Staging con la MISMA forma que la tabla: así el COPY no depende de que el CSV traiga el orden exacto.
    sentencias.push(`create temp table ${temporal} (like ${tabla} including defaults) on commit drop;`);
    sentencias.push(`\\copy ${temporal} from '${datos.fichero}' with (format csv, header true)`);
    // Columnas reales de la tabla, para el upsert.
    const cols = psql(contenedor, usuario, base,
      `select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_schema='${tabla.split('.')[0]}' and table_name='${tabla.split('.')[1]}'`).trim();
    const asignaciones = cols.split(', ').map((c) => `${c} = excluded.${c}`).join(', ');
    sentencias.push(`insert into ${tabla} (${cols}) select ${cols} from ${temporal}
      on conflict (id) do update set ${asignaciones};`);
  }
  sentencias.push(`insert into ops.lote_cargado (lote, ficheros, filas, manifiesto)
    values ('${id}', ${Object.keys(manifiesto.tablas).length}, ${filas}, '${JSON.stringify(manifiesto)}'::jsonb);`);
  sentencias.push('commit;');

  execFileSync('docker', ['exec', '-i', contenedor, 'psql', '-U', usuario, '-d', base, '-v', 'ON_ERROR_STOP=1'],
    { input: sentencias.join('\n'), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  console.log(JSON.stringify({ id, cargado: true, tablas: Object.keys(manifiesto.tablas).length, filas }));
}

if (process.argv[1]?.endsWith('carga-lote.mjs')) {
  try { main(); } catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
}
