#!/usr/bin/env node
/**
 * Diagnóstico puntual de planes (no es una puerta).
 *
 * Mide con EXPLAIN (ANALYZE, BUFFERS) las consultas del catálogo y emite SOLO un JSON numérico
 * por consulta, con el prefijo `FLUJO_EXPLAIN_SUMMARY `. Nunca imprime SQL, filtros, parámetros
 * ni filas: el lector del arnés descarta cualquier campo que no sea numérico.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const solo = process.argv.find((a) => a.startsWith('--solo='))?.slice('--solo='.length);

const { default: pg } = await import(new URL('../../packages/canonico/node_modules/pg/lib/index.js', import.meta.url).href);
const env = readFileSync(join(RAIZ, '.env'), 'utf8');
const url = (/^DATABASE_URL_PUBLICADOR=(.*)$/m.exec(env)?.[1] ?? /^DATABASE_URL_LECTOR=(.*)$/m.exec(env)?.[1])?.trim();
if (!url) throw new Error('Falta DATABASE_URL_PUBLICADOR (o DATABASE_URL_LECTOR) en .env');

const importa = (relativa) => import(pathToFileURL(join(RAIZ, relativa)).href);
const { CONSULTAS_CATALOGO, PARAMETROS_CATALOGO } = await importa('apps/web/src/consultas/catalogo.ts');

const consultas = CONSULTAS_CATALOGO
  .map((c) => ({ ...c, parametros: PARAMETROS_CATALOGO[c.nombre] ?? [] }))
  .filter((c) => !solo || c.nombre === solo);

/** Recorre el plan y devuelve SOLO números y el tipo de nodo. */
function resumenNodos(nodo) {
  if (!nodo) return [];
  const propio = {
    type: String(nodo['Node Type'] ?? ''),
    estimated_rows: Number(nodo['Plan Rows'] ?? 0),
    actual_rows: Number(nodo['Actual Rows'] ?? 0),
    loops: Number(nodo['Actual Loops'] ?? 0),
    actual_ms: Number(nodo['Actual Total Time'] ?? 0),
    shared_hit_blocks: Number(nodo['Shared Hit Blocks'] ?? 0),
    shared_read_blocks: Number(nodo['Shared Read Blocks'] ?? 0),
  };
  return [propio, ...(nodo['Plans'] ?? []).flatMap(resumenNodos)];
}

const pool = new pg.Pool({ connectionString: url, max: 1, application_name: 'facylf-explain' });
await pool.query("set statement_timeout = '120s'");

for (const consulta of consultas) {
  let mejor = null;
  const inicio = Date.now();
  try {
    for (let intento = 0; intento < 2; intento++) {
      const { rows } = await pool.query(`explain (analyze, buffers, format json) ${consulta.sql}`, [...consulta.parametros]);
      const plan = rows[0]['QUERY PLAN'][0];
      const ms = Number(plan['Execution Time'] ?? 0);
      if (mejor === null || ms < mejor.ms) mejor = { plan, ms };
    }
  } catch (error) {
    console.error(`FALLO ${consulta.nombre}: ${error?.code ?? 'sin-codigo'} ${error?.message ?? ''}`);
    continue;
  }
  const { plan, ms } = mejor;
  const salida = {
    query: consulta.nombre,
    execution_ms: ms,
    planning_ms: Number(plan['Planning Time'] ?? 0),
    wall_ms: Date.now() - inicio,
    nodes: resumenNodos(plan.Plan),
  };
  console.log(`FLUJO_EXPLAIN_SUMMARY ${JSON.stringify(salida)}`);
}

await pool.end();
