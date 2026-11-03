#!/usr/bin/env node
/**
 * Diagnóstico puntual (no es una puerta): mide el presupuesto p95 de las consultas del catálogo
 * que sirven las pantallas de listado y portada, y compara formas alternativas de `listado-de-grupos`.
 *
 * Emite SOLO un JSON numérico por medición con el prefijo `FLUJO_EXPLAIN_SUMMARY `. Nunca imprime
 * SQL, filtros, parámetros ni filas.
 *
 * La conexión se toma de la MISMA frontera que usa la web (`conexion.ts`): el runner inyecta
 * DATABASE_URL_LECTOR y no hace falta leer `.env` ni importar `pg` por una ruta de node_modules
 * que en el sandbox pnpm no existe.
 */
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(import.meta.dirname, '..', '..');

// La puerta se registra como `node pruebas/ci/_probar-listado.mjs`, y node puro no carga `.ts`.
// Se reejecuta el MISMO archivo con tsx (igual que la puerta de planes) y el hijo hace la medición.
if (!process.argv.includes('--con-tsx')) {
  const r = spawnSync(
    'pnpm',
    [
      '--filter', '@facylf/canonico', 'exec', 'tsx',
      '--tsconfig', '../../apps/web/tsconfig.json',
      '../../pruebas/ci/_probar-listado.mjs', '--con-tsx',
    ],
    { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (r.error) console.error(`no se pudo lanzar tsx: ${r.error.message}`);
  for (const linea of String(r.stdout ?? '').split(/\r?\n/)) {
    if (linea.startsWith('FLUJO_EXPLAIN_SUMMARY ')) console.log(linea);
  }
  // Sin escritura en el árbol: un recibo local cambiaría la huella durante la propia puerta.
  process.exit(r.status ?? 1);
}

const importa = (relativa) => import(pathToFileURL(join(RAIZ, relativa)).href);
const { consulta, cierraCanonico } = await importa('apps/web/src/consultas/adaptadores/postgres/conexion.ts');
const { CONSULTAS_CATALOGO, PARAMETROS_CATALOGO } = await importa('apps/web/src/consultas/catalogo.ts');
const { SQL_FEDERACION_NO_EXCLUIDA } = await importa('apps/web/src/lib/federaciones-excluidas.ts');

const buscar = (nombre) => CONSULTAS_CATALOGO.find((c) => c.nombre === nombre);

const FILTROS = `
       where ($1::text is null or f.codigo = $1)
         and ($2::text is null or s.etiqueta = $2)
         and ($3::text is null or s.etiqueta >= $3)
         and ($4::text[] is null or e.ambito = any($4::text[]))
         and ($5::text is null or e.modalidad = $5)
         and ($6::text is null or e.genero = $6)
         and ($7::text is null or e.categoria = $7)
         and ($8::text is null or e.provincia = $8)
         and ($9::smallint is null or e.nivel = $9)
         and (coalesce($10::text, '') = ''
              or core.normaliza_nombre(e.nombre_publicado || ' ' || g.nombre || ' ' || s.etiqueta)
                 like '%' || core.normaliza_nombre($10) || '%')
         and (not coalesce($11::boolean, false) or c.partidos_conocidos > 0)`;

/** Candidata: primero se pagina (sólo las columnas de la página), después se cuentan inscripciones y total. */
const CANDIDATA = `
    with base as (
      select g.id,
             g.orden                                      as grupo_orden,
             f.codigo                                     as federacion,
             f.nombre                                     as federacion_nombre,
             s.etiqueta                                   as temporada,
             s.orden                                      as temporada_orden,
             e.codigo_externo                             as edicion_codigo,
             e.nombre_publicado                           as edicion,
             e.ambito,
             e.modalidad,
             e.genero,
             e.categoria,
             e.provincia,
             g.codigo_externo                             as grupo_codigo,
             g.nombre                                     as grupo,
             g.tipo                                       as grupo_tipo,
             g.jornadas_previstas,
             c.partidos_conocidos,
             c.partidos_con_resultado,
             c.actas_disponibles,
             c.actas_parseadas,
             c.complete_through_matchday,
             c.visibility_state,
             c.calculado_en
        from core.phase_group g
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        join core.season s on s.id = e.season_id
        left join ops.coverage_checkpoint c on c.phase_group_id = g.id
        ${FILTROS}
    )
    select p.federacion,
           p.federacion_nombre,
           p.temporada,
           p.edicion_codigo,
           p.edicion,
           p.ambito,
           p.modalidad,
           p.genero,
           p.categoria,
           p.provincia,
           p.grupo_codigo,
           p.grupo,
           p.grupo_tipo,
           p.jornadas_previstas,
           (select count(*) from core.team_entry te where te.phase_group_id = p.id)::int as inscripciones,
           p.partidos_conocidos,
           p.partidos_con_resultado,
           p.actas_disponibles,
           p.actas_parseadas,
           p.complete_through_matchday,
           p.visibility_state,
           p.calculado_en,
           (select count(*) from base)::int             as total
      from base p
     order by p.federacion, p.temporada_orden desc, p.edicion, p.grupo_orden, p.grupo_codigo
     limit $12 offset $13`;

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

function percentil(ordenados, p) {
  if (ordenados.length === 0) return null;
  const i = Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1));
  return ordenados[i];
}

/**
 * Ejecuta una consulta N veces (tras un calentamiento) y devuelve la distribución de tiempos.
 * Mide el tiempo de pared de la ida y vuelta, que es lo que sufre la pantalla, no sólo el
 * `Execution Time` del plan.
 */
async function muestrear(sql, parametros, muestras, presupuestoMs) {
  const tiempos = [];
  for (let i = 0; i <= muestras; i++) {
    const t0 = performance.now();
    await consulta(sql, parametros, { presupuestoMs });
    const ms = performance.now() - t0;
    if (i > 0) tiempos.push(ms);
  }
  const ordenados = [...tiempos].sort((a, b) => a - b);
  return {
    muestras: tiempos.length,
    p50_ms: Number(percentil(ordenados, 50).toFixed(3)),
    p95_ms: Number(percentil(ordenados, 95).toFixed(3)),
    max_ms: Number(ordenados[ordenados.length - 1].toFixed(3)),
  };
}

// 1) Presupuesto p95 de las dos consultas que sirven las pantallas de la entrega.
for (const nombre of ['listado-de-grupos', 'recuentos-del-canónico']) {
  const c = buscar(nombre);
  if (!c) {
    console.error(`FALTA consulta ${nombre}`);
    continue;
  }
  const parametros = PARAMETROS_CATALOGO[nombre] ?? [];
  try {
    const dist = await muestrear(c.sql, parametros, 20, c.presupuestoMs);
    console.log(`FLUJO_EXPLAIN_SUMMARY ${JSON.stringify({
      query: nombre,
      presupuesto_ms: c.presupuestoMs,
      execution_ms: dist.p95_ms,
      planning_ms: 0,
      nodes: [],
      p50_ms: dist.p50_ms,
      p95_ms: dist.p95_ms,
      max_ms: dist.max_ms,
      muestras: dist.muestras,
    })}`);
  } catch (error) {
    console.error(`FALLO ${nombre}: ${error?.code ?? 'sin-codigo'} ${error?.message ?? ''}`);
  }
}

// 2) Comparación de formas del listado con EXPLAIN (ANALYZE, BUFFERS), como hasta ahora.
const base = buscar('listado-de-grupos');
const parametros = PARAMETROS_CATALOGO['listado-de-grupos'];

const variantes = [
  { nombre: 'listado-actual', sql: base.sql },
  { nombre: 'listado-paginado-primero', sql: CANDIDATA },
];

for (const variante of variantes) {
  let mejor = null;
  const inicio = Date.now();
  try {
    for (let intento = 0; intento < 2; intento++) {
      const rows = await consulta(`explain (analyze, buffers, format json) ${variante.sql}`, [...parametros], {
        presupuestoMs: 120_000,
      });
      const plan = rows[0]['QUERY PLAN'][0];
      const ms = Number(plan['Execution Time'] ?? 0);
      if (mejor === null || ms < mejor.ms) mejor = { plan, ms };
    }
  } catch (error) {
    console.error(`FALLO ${variante.nombre}: ${error?.code ?? 'sin-codigo'} ${error?.message ?? ''}`);
    continue;
  }
  const { plan, ms } = mejor;
  console.log(`FLUJO_EXPLAIN_SUMMARY ${JSON.stringify({
    query: variante.nombre,
    presupuesto_ms: base.presupuestoMs,
    execution_ms: ms,
    planning_ms: Number(plan['Planning Time'] ?? 0),
    wall_ms: Date.now() - inicio,
    nodes: resumenNodos(plan.Plan),
  })}`);
}

await cierraCanonico();
