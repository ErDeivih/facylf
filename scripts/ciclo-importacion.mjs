#!/usr/bin/env node
/*
 * EL CICLO COMPLETO, EN UN COMANDO Y CON EL ANTES Y EL DESPUÉS MEDIDOS.
 *
 * Por qué existe. Cuando llegan datos nuevos —el recolector no para— hay que volver a hacer lo mismo: mirar
 * qué falta, importarlo, y comprobar que de verdad entró. Eso eran seis herramientas y una libreta: el plan de
 * `importar:todo`, la importación, el parte de `importar:estado`, la auditoría acta a acta, la bitácora de los
 * recolectores y la revisión de la tabla oficial. Y ninguna de ellas decía **qué cambió desde la vez anterior**,
 * que es la única pregunta que importa cuando se repite un ciclo: ¿esto ha avanzado?
 *
 * Esto hace las cuatro cosas:
 *
 *   1. MIDE antes: pendientes, lo que ha crecido, la tabla oficial sin importar, actas sin informe, y lo que
 *      los recolectores decidieron no recoger.
 *   2. IMPORTA (sólo con `--aplicar`), con el importador de siempre: reanudable y con su registro.
 *   3. MIDE después, con las mismas herramientas y los mismos parámetros.
 *   4. ESCRIBE el parte en `pruebas/reconstruccion/ciclo-importacion.json` **y lo compara con el anterior**,
 *      para que «¿ha avanzado?» se responda con números y no con la impresión de que tardó mucho.
 *
 * Nada se importa sin `--aplicar`: por defecto sólo mide y dice qué haría.
 *
 * Uso:
 *   node scripts/ciclo-importacion.mjs                 · mide, compara con el ciclo anterior y no importa nada
 *   node scripts/ciclo-importacion.mjs --aplicar       · además importa todo lo que falte (puede tardar horas)
 *   node scripts/ciclo-importacion.mjs --federacion galicia
 *   node scripts/ciclo-importacion.mjs --sin-plan      · no recalcula el plan (es el paso más lento)
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(RAIZ, 'pruebas', 'reconstruccion', 'ciclo-importacion.json');
const TSX_CLI = join(RAIZ, 'packages', 'canonico', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const IMPORTAR_TODO = join(RAIZ, 'scripts', 'importar-todo.mts');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const aplicar = argumentos.includes('--aplicar');
const sinPlan = argumentos.includes('--sin-plan');
const federacion = arg('federacion');

const extra = federacion === null ? [] : ['--federacion', federacion];

/**
 * Ejecuta una herramienta y devuelve su salida. `--json` para las que lo tienen: así el parte del ciclo se
 * compone de DATOS y no de texto parseado, que se rompe en cuanto alguien mejora un mensaje.
 */
function ejecuta(comando, args, { json = false, heredar = false } = {}) {
  const inicio = Date.now();
  // Sin shell y con windowsHide: en Windows cada `pnpm`/`cmd` intermedio abría una consola.
  const r = spawnSync(comando, args, {
    cwd: RAIZ,
    windowsHide: true,
    stdio: heredar ? 'inherit' : ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const segundos = Math.round((Date.now() - inicio) / 1000);
  if (r.status !== 0 && !heredar) {
    console.error(`  ✗ ${comando} ${args.join(' ')} ha terminado con ${r.status}`);
  }
  return { salida: heredar ? '' : (r.stdout ?? ''), segundos, ok: r.status === 0 };
}

/** Los números del plan del importador, que sólo habla texto (y a propósito: es para leerlo). */
function delPlan(texto) {
  const n = (re) => {
    const m = re.exec(texto);
    return m === null ? null : Number(m[1]);
  };
  return {
    gruposEnElPlan: n(/importación completa · (\d+) grupo\(s\) en el plan/),
    yaEnElCanonico: n(/en el plan · (\d+) ya en el canónico/),
    porHacer: n(/ya en el canónico · (\d+) por hacer/),
    crecidos: n(/(\d+) de ellos YA estaban en el canónico y vuelven/),
    sinTablaOficial: n(/(\d+) grupo\(s\) YA estaban con partidos y actas pero SIN su clasificación oficial/),
    noSeReintentan: n(/(\d+) grupo\(s\) NO se reintentan/),
    conActas: n(/de los pendientes, (\d+) tienen actas/),
    totalConActas: n(/TOTAL\s+\d+ grupos ·\s+(\d+) con actas/),
  };
}

const antes = Date.now();
console.log(`═══ ciclo de importación · ${new Date().toLocaleString('es-ES')}`
  + `${aplicar ? '' : ' · (sólo medir: añade --aplicar para importar)'}`);

/* ── 1. Las medidas de antes ─────────────────────────────────────────────────────────────────────────── */
console.log('\n── midiendo antes…');
let plan = null;
if (!sinPlan) {
  const r = ejecuta(process.execPath, [TSX_CLI, IMPORTAR_TODO, '--plan', ...extra]);
  plan = { ...delPlan(r.salida), segundos: r.segundos };
  console.log(`   el plan: ${plan.porHacer ?? '?'} grupo(s) por hacer · ${plan.sinTablaOficial ?? '?'} sólo por la tabla oficial (${r.segundos} s)`);
}
const estadoAntes = JSON.parse(ejecuta(process.execPath, [join(RAIZ, 'scripts', 'estado-importacion.mjs'), '--json', ...extra]).salida);
const actasAntes = JSON.parse(ejecuta(process.execPath, [join(RAIZ, 'scripts', 'mide-actas-sin-informe.mjs'), '--json', ...extra]).salida);
const bitacoraAntes = JSON.parse(ejecuta(process.execPath, [join(RAIZ, 'scripts', 'mide-bitacora-de-colas.mjs'), '--json', ...extra]).salida);

/* ── 2. Importar (si se ha pedido) ───────────────────────────────────────────────────────────────────── */
let importacion = null;
if (aplicar) {
  console.log('\n── importando todo lo que falte (esto es lo que tarda)…');
  const r = ejecuta(process.execPath, [TSX_CLI, IMPORTAR_TODO, ...extra], { heredar: true });
  importacion = { segundos: r.segundos, ok: r.ok };
  console.log(`   importación terminada en ${Math.round(r.segundos / 60)} min (${r.ok ? 'sin fallo de proceso' : 'el proceso terminó con error'})`);
}

/* ── 3. Las medidas de después ───────────────────────────────────────────────────────────────────────── */
console.log('\n── midiendo después…');
const estadoDespues = JSON.parse(ejecuta(process.execPath, [join(RAIZ, 'scripts', 'estado-importacion.mjs'), '--json', ...extra]).salida);
const actasDespues = JSON.parse(ejecuta(process.execPath, [join(RAIZ, 'scripts', 'mide-actas-sin-informe.mjs'), '--json', ...extra]).salida);
const bitacoraDespues = JSON.parse(ejecuta(process.execPath, [join(RAIZ, 'scripts', 'mide-bitacora-de-colas.mjs'), '--json', ...extra]).salida);
let planDespues = null;
if (!sinPlan) {
  const r = ejecuta(process.execPath, [TSX_CLI, IMPORTAR_TODO, '--plan', ...extra]);
  planDespues = { ...delPlan(r.salida), segundos: r.segundos };
}

/** Lo que se guarda de cada ciclo: los mismos números, con nombre, para poder compararlos entre ciclos. */
const resumen = (estado, actas, bitacora, elPlan) => ({
  enElCanonico: estado.totales.enCanonico,
  pendientes: estado.totales.pendientes,
  fallidos: estado.totales.fallidos,
  gruposConDatosEnLasColas: estado.totales.enCola,
  gruposQueLaColaConoce: estado.totales.conocidos,
  sinDatosRecolectados: estado.totales.sinDatos,
  partidos: estado.totales.partidos,
  actas: estado.totales.actas,
  apariciones: estado.totales.apariciones,
  personas: estado.totales.personasEnElCanonico,
  tablaOficial: estado.totales.tablaOficial,
  actasEnLasColas: estado.totales.actasEnLasColas,
  actasHechasSinInforme: actas.actasSinInforme,
  actasSinInformeQueElPlanNoVe: actas.actasQueElPlanNoVe,
  gruposDeMenoresSinRecoger: bitacora.gruposDeMenores?.grupos ?? null,
  partidosDeMenoresSinActa: bitacora.gruposDeMenores?.partidosSinActa ?? null,
  plan: elPlan,
});

const medidas = {
  antes: resumen(estadoAntes, actasAntes, bitacoraAntes, plan),
  despues: resumen(estadoDespues, actasDespues, bitacoraDespues, planDespues),
};

/* ── 4. El parte, comparado con el ciclo anterior ────────────────────────────────────────────────────── */
const historial = existsSync(SNAPSHOT) ? (JSON.parse(readFileSync(SNAPSHOT, 'utf8')).ciclos ?? []) : [];
/*
 * Se compara con el último ciclo DE LA MISMA FEDERACIÓN, no con el último a secas: un ciclo suelto de una
 * federación —para arreglar algo— dejaría todos los totales del país desplomados en la comparación, y esas
 * flechas dicen cosas falsas.
 */
const anterior = [...historial].reverse().find((c) => (c.federacion ?? null) === (federacion ?? null)) ?? null;

const ciclo = {
  cuando: new Date().toISOString(),
  federacion: federacion ?? null,
  aplicado: aplicar,
  segundosTotales: Math.round((Date.now() - antes) / 1000),
  importacion,
  medidas,
};
historial.push(ciclo);
writeFileSync(SNAPSHOT, `${JSON.stringify({ ciclos: historial.slice(-30) }, null, 2)}\n`);

const fila = (etiqueta, valor, previo) => {
  const delta = previo === null || previo === undefined ? '' : `   ${valor - previo >= 0 ? '+' : ''}${valor - previo}`;
  console.log(`  ${etiqueta.padEnd(44)} ${String(valor).padStart(9)}${delta}`);
};
console.log('\n═══ el ciclo, medido');
console.log(`  ${' '.repeat(44)} ${'ahora'.padStart(9)}   desde el ciclo anterior`);
fila('grupos en el canónico', medidas.despues.enElCanonico, anterior?.medidas.despues.enElCanonico);
fila('grupos pendientes de importar', medidas.despues.pendientes, anterior?.medidas.despues.pendientes);
fila('grupos con el último intento fallido', medidas.despues.fallidos, anterior?.medidas.despues.fallidos);
fila('partidos en el canónico', medidas.despues.partidos, anterior?.medidas.despues.partidos);
fila('actas en el canónico', medidas.despues.actas, anterior?.medidas.despues.actas);
fila('apariciones en el canónico', medidas.despues.apariciones, anterior?.medidas.despues.apariciones);
fila('personas en el canónico', medidas.despues.personas, anterior?.medidas.despues.personas);
fila('tabla oficial importada', medidas.despues.tablaOficial.importada, anterior?.medidas.despues.tablaOficial.importada);
fila('tabla oficial archivada SIN IMPORTAR', medidas.despues.tablaOficial.sinImportar, anterior?.medidas.despues.tablaOficial.sinImportar);
fila('tabla oficial ILEGIBLE para el lector', medidas.despues.tablaOficial.ilegible, anterior?.medidas.despues.tablaOficial.ilegible);
fila('tabla oficial archivada sin filas', medidas.despues.tablaOficial.sinFilas, anterior?.medidas.despues.tablaOficial.sinFilas);
fila('tabla oficial rechazada (validador o resolutor)', medidas.despues.tablaOficial.rechazada, anterior?.medidas.despues.tablaOficial.rechazada);
fila('actas hechas sin informe', medidas.despues.actasHechasSinInforme, anterior?.medidas.despues.actasHechasSinInforme);
fila('  y de ellas, ninguna señal las ve', medidas.despues.actasSinInformeQueElPlanNoVe, anterior?.medidas.despues.actasSinInformeQueElPlanNoVe);
fila('actas pendientes dentro del alcance', medidas.despues.actasEnLasColas.pendiente, anterior?.medidas.despues.actasEnLasColas.pendiente);
fila('grupos de menores sin recoger a propósito', medidas.despues.gruposDeMenoresSinRecoger, anterior?.medidas.despues.gruposDeMenoresSinRecoger);
if (medidas.despues.plan !== null && medidas.despues.plan.porHacer !== null) {
  fila('grupos por hacer según el plan', medidas.despues.plan.porHacer, anterior?.medidas.despues.plan?.porHacer);
  fila('  sólo por la tabla oficial archivada', medidas.despues.plan.sinTablaOficial ?? 0, anterior?.medidas.despues.plan?.sinTablaOficial);
}
if (anterior === null) {
  console.log('\n  (es el primer ciclo guardado: no hay con qué compararlo; el siguiente sí tendrá)');
}
console.log(`\n  el historial (30 ciclos como máximo): ${SNAPSHOT.replace(`${RAIZ}\\`, '')}`);
if (!aplicar) console.log('  no se ha importado nada. Vuelve a lanzarlo con --aplicar cuando toque.');
