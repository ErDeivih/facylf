#!/usr/bin/env node
/**
 * Presupuestos de consulta y planes guardados.
 *
 * La regla de `RENDIMIENTO-BUSQUEDA.md`: cada recorrido importante mantiene una consulta representativa,
 * un presupuesto, un `EXPLAIN (ANALYZE, BUFFERS)` y una prueba que evita resultados sin límite. Aquí se
 * hace eso para las consultas de la web:
 *
 *   1. mide el tiempo real y lo compara con el presupuesto declarado en la consulta;
 *   2. guarda la FORMA del plan en `pruebas/planes/<consulta>.json` y avisa si cambia, para que alguien
 *      mire por qué y no se actualice el fichero sin pensar;
 *   3. comprueba que una consulta marcada como `indexado` no hace un `Seq Scan` sobre una tabla de
 *      hechos (partidos, participaciones, eventos, fichas): eso es un aviso estructural, no una manía.
 *
 * Las consultas agregadas (recuentos globales, cobertura por federación) sí recorren tablas enteras:
 * eso es inherente a lo que piden y por eso se marcan como `agregado`. La página de diagnóstico es la
 * única que las usa.
 *
 * Uso:
 *   npx tsx scripts/planes.mjs            # mide y compara
 *   npx tsx scripts/planes.mjs --guardar  # además, actualiza los planes guardados
 *
 * Nota honesta: esto se lanza en la máquina que también corre los recolectores. Son unos pocos EXPLAIN
 * de milisegundos, no una prueba de carga; lo que la skill prohíbe aquí es Lighthouse/Playwright y las
 * pruebas de concurrencia, y eso no se hace.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = resolve(import.meta.dirname, '..');
const CARPETA_PLANES = join(RAIZ, 'pruebas', 'planes');
const guardar = process.argv.includes('--guardar');

const { default: pg } = await import(new URL('../packages/canonico/node_modules/pg/lib/index.js', import.meta.url).href);
const env = readFileSync(join(RAIZ, '.env'), 'utf8');
const url = /^DATABASE_URL_LECTOR=(.*)$/m.exec(env)?.[1]?.trim();
if (!url) throw new Error('Falta DATABASE_URL_LECTOR en .env');

// En Windows hay que pasar file:// (una ruta `F:\...` no vale como URL de importación).
const importa = (relativa) => import(pathToFileURL(join(RAIZ, relativa)).href);
const { CONSULTAS_COBERTURA, PARAMETROS_POR_DEFECTO } = await importa('apps/web/src/consultas/cobertura.ts');
const { CONSULTAS_PARTIDOS, PARAMETROS_PARTIDOS } = await importa('apps/web/src/consultas/partidos.ts');

/** Tablas de hechos: crecen con los partidos y nunca deben recorrerse enteras en un recorrido crítico. */
const TABLAS_DE_HECHOS = ['match', 'appearance', 'match_event', 'match_staff', 'match_report', 'match_official', 'match_source'];

const catalogo = [...CONSULTAS_COBERTURA, ...CONSULTAS_PARTIDOS].map((c) => ({
  ...c,
  parametros: PARAMETROS_POR_DEFECTO[c.nombre] ?? PARAMETROS_PARTIDOS[c.nombre] ?? [],
}));

function recorrePlan(nodo, acumulador = { nodos: [], seqScans: [], filas: 0 }) {
  if (!nodo) return acumulador;
  acumulador.nodos.push(nodo['Node Type']);
  if (nodo['Node Type'] === 'Seq Scan' && nodo['Relation Name']) acumulador.seqScans.push(nodo['Relation Name']);
  acumulador.filas = Math.max(acumulador.filas, Number(nodo['Actual Rows'] ?? 0));
  for (const hijo of nodo['Plans'] ?? []) recorrePlan(hijo, acumulador);
  return acumulador;
}

const pool = new pg.Pool({ connectionString: url, max: 2, application_name: 'facylf-planes' });
let fallos = 0;
mkdirSync(CARPETA_PLANES, { recursive: true });

console.log('consulta                        tiempo   presupuesto  nodos  seq scans                        veredicto');
for (const consulta of catalogo) {
  const { rows } = await pool.query(`explain (analyze, buffers, format json) ${consulta.sql}`, [...consulta.parametros]);
  const plan = rows[0]['QUERY PLAN'][0];
  const ms = Number(plan['Execution Time'] ?? 0);
  const resumen = recorrePlan(plan.Plan);
  const seqHechos = resumen.seqScans.filter((r) => TABLAS_DE_HECHOS.includes(r));
  const dentro = ms <= consulta.presupuestoMs;
  const estructural = consulta.plan === 'indexado' && seqHechos.length > 0;
  const veredicto = estructural ? '✗ Seq Scan en tabla de hechos' : dentro ? '✓' : `✗ ${(ms - consulta.presupuestoMs).toFixed(0)} ms de más`;
  if (estructural || !dentro) fallos++;

  console.log(`${consulta.nombre.padEnd(30)} ${ms.toFixed(1).padStart(7)} ms ${String(consulta.presupuestoMs).padStart(9)} ms ${String(resumen.nodos.length).padStart(6)}  ${(resumen.seqScans.join(', ') || '—').padEnd(32)} ${veredicto}`);

  const forma = { nodos: [...new Set(resumen.nodos)].sort(), seqScans: [...new Set(resumen.seqScans)].sort(), filas: resumen.filas };
  const ruta = join(CARPETA_PLANES, `${consulta.nombre.replace(/[^\w-]/g, '-')}.json`);
  if (guardar || !existsSync(ruta)) {
    writeFileSync(ruta, `${JSON.stringify({ consulta: consulta.nombre, presupuestoMs: consulta.presupuestoMs, plan: consulta.plan, forma }, null, 2)}\n`);
  } else {
    const anterior = JSON.parse(readFileSync(ruta, 'utf8'));
    const cambiado = JSON.stringify(anterior.forma.nodos) !== JSON.stringify(forma.nodos)
      || JSON.stringify(anterior.forma.seqScans) !== JSON.stringify(forma.seqScans);
    if (cambiado) {
      // Un plan que cambia sin buscarlo suele ser un índice que ha dejado de usarse. Falla para que
      // alguien mire, en vez de actualizar el fichero sin pensar (RENDIMIENTO-BUSQUEDA.md).
      fallos++;
      console.log(`    ✗ el plan de «${consulta.nombre}» ha cambiado de forma:`);
      console.log(`      antes: ${anterior.forma.nodos.join(' → ')} (seq: ${anterior.forma.seqScans.join(', ') || '—'})`);
      console.log(`      ahora: ${forma.nodos.join(' → ')} (seq: ${forma.seqScans.join(', ') || '—'})`);
      console.log('      Míralo con atención y, si el cambio es correcto, vuelve a guardarlo con --guardar.');
    }
  }
}

console.log(fallos === 0
  ? '\nTodo dentro de presupuesto y sin recorridos completos donde no toca.'
  : `\n${fallos} consulta(s) fuera de presupuesto o con recorrido completo.`);
await pool.end();
process.exit(fallos === 0 ? 0 : 1);
