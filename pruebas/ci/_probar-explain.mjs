#!/usr/bin/env node
/**
 * Diagnóstico puntual de planes (no es una puerta).
 *
 * Mide con EXPLAIN (ANALYZE, BUFFERS) UNA forma candidata de `listado-de-grupos` y emite SOLO un
 * JSON numérico con el prefijo `FLUJO_EXPLAIN_SUMMARY `. Nunca imprime SQL, filtros, parámetros ni
 * filas. Si algo falla, imprime igualmente la línea con el código público del error para que el
 * arnés tenga recibo.
 *
 * La forma actual ya está medida con recibo `03a7c6073a5d…`: 6786,7 ms (WindowAgg sobre 50 268
 * filas 5562,4 ms; agregado global de `core.team_entry` ≈2 s).
 */
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(import.meta.dirname, '..', '..');
const VARIANTE = 'paginado-primero';

// La puerta se registra como `node pruebas/ci/_probar-explain.mjs`, y node puro no carga `.ts`.
// Se reejecuta el MISMO archivo con tsx y el hijo hace la medición.
if (!process.argv.includes('--con-tsx')) {
  const r = spawnSync(
    'pnpm',
    [
      '--filter', '@facylf/canonico', 'exec', 'tsx',
      '--tsconfig', '../../apps/web/tsconfig.json',
      '../../pruebas/ci/_probar-explain.mjs', '--con-tsx',
    ],
    { cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (r.error) console.error(`no se pudo lanzar tsx: ${r.error.message}`);
  // El hijo se ejecuta con stdio capturado y el padre reemite SOLO las líneas del resumen. Si el hijo
  // heredara la salida, el lector del arnés no vería la línea y el recibo llegaría vacío.
  for (const linea of String(r.stdout ?? '').split(/\r?\n/)) {
    if (linea.startsWith('FLUJO_EXPLAIN_SUMMARY ')) console.log(linea);
  }
  if (r.status !== 0 && !String(r.stdout ?? '').includes('FLUJO_EXPLAIN_SUMMARY ')) {
    const motivo = String(r.stderr ?? '').split(/\r?\n/).find((l) => /FALLO|Error|error/.test(l));
    if (motivo) console.error(motivo.slice(0, 300));
  }
  process.exit(r.status ?? 1);
}

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

function emitir(campos) {
  console.log(`FLUJO_EXPLAIN_SUMMARY ${JSON.stringify(campos)}`);
}

let cerrar = null;
const inicio = Date.now();
try {
  const importa = (relativa) => import(pathToFileURL(join(RAIZ, relativa)).href);
  const { consulta, cierraCanonico } = await importa('apps/web/src/consultas/adaptadores/postgres/conexion.ts');
  cerrar = cierraCanonico;
  const { CONSULTAS_CATALOGO, PARAMETROS_CATALOGO } = await importa('apps/web/src/consultas/catalogo.ts');
  const { SQL_FEDERACION_NO_EXCLUIDA } = await importa('apps/web/src/lib/federaciones-excluidas.ts');

  const actual = CONSULTAS_CATALOGO.find((c) => c.nombre === 'listado-de-grupos');
  const parametros = PARAMETROS_CATALOGO['listado-de-grupos'];
  const presupuesto = Number(actual?.presupuestoMs ?? 0);

  // Pagina primero sobre una proyección estrecha (id + claves de orden), cuenta el total sobre esa
  // proyección y sólo después trae las columnas anchas de las 80 filas de la página. Las
  // inscripciones se agregan sólo para los ids de la página, no para todo `team_entry`.
  const sql = `
    with filtrados as (
      select g.id,
             f.codigo             as federacion,
             s.orden              as temporada_orden,
             e.nombre_publicado   as edicion,
             g.orden              as grupo_orden,
             g.codigo_externo     as grupo_codigo
        from core.phase_group g
        join core.competition_edition e on e.id = g.competition_edition_id
        join core.federation f on f.id = e.federation_id and (${SQL_FEDERACION_NO_EXCLUIDA})
        join core.season s on s.id = e.season_id
        left join ops.coverage_checkpoint c on c.phase_group_id = g.id
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
         and (not coalesce($11::boolean, false) or c.partidos_conocidos > 0)
    ),
    total as (select count(*)::int as total from filtrados),
    pagina as (
      select * from filtrados
       order by federacion, temporada_orden desc, edicion, grupo_orden, grupo_codigo
       limit $12 offset $13
    )
    select f.codigo, f.nombre, s.etiqueta, e.codigo_externo, e.nombre_publicado, e.ambito,
           e.modalidad, e.genero, e.categoria, e.provincia, g.codigo_externo, g.nombre, g.tipo,
           g.jornadas_previstas,
           coalesce(te.inscripciones, 0)::int as inscripciones,
           c.partidos_conocidos, c.partidos_con_resultado, c.actas_disponibles, c.actas_parseadas,
           c.complete_through_matchday, c.visibility_state, c.calculado_en, t.total
      from pagina p
      join core.phase_group g on g.id = p.id
      join core.competition_edition e on e.id = g.competition_edition_id
      join core.federation f on f.id = e.federation_id
      join core.season s on s.id = e.season_id
      left join ops.coverage_checkpoint c on c.phase_group_id = g.id
      left join (select phase_group_id, count(*) as inscripciones
                   from core.team_entry
                  where phase_group_id in (select id from pagina)
                  group by phase_group_id) te on te.phase_group_id = p.id
      cross join total t
     order by p.federacion, p.temporada_orden desc, p.edicion, p.grupo_orden, p.grupo_codigo`;

  const rows = await consulta(`explain (analyze, buffers, format json) ${sql}`, [...parametros], {
    presupuestoMs: 120_000,
  });
  const plan = rows[0]['QUERY PLAN'][0];
  void presupuesto;
  emitir({
    query: VARIANTE,
    execution_ms: Number(plan['Execution Time'] ?? 0),
    planning_ms: Number(plan['Planning Time'] ?? 0),
    nodes: resumenNodos(plan.Plan),
  });
} catch (error) {
  emitir({
    query: VARIANTE,
    execution_ms: -1,
    planning_ms: 0,
    nodes: [],
  });
  void error;
} finally {
  if (cerrar) await cerrar().catch(() => {});
}
