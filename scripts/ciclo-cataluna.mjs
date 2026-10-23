#!/usr/bin/env node
/*
 * CICLO CATALUÑA: reparar el calendario de la cola desde las actas, retirar lo inventado del canónico e
 * importar lo de verdad. Es la herramienta que se vuelve a lanzar cuando llegan actas nuevas.
 *
 * ── POR QUÉ HACE FALTA UN CICLO Y NO UN COMANDO ────────────────────────────────────────────────────────
 *
 * 1. El recolector de Cataluña repitió una jornada en todas las demás (§3.11) y esos partidos inventados
 *    están en la cola: el importador los rechaza con razón.
 * 2. El único documento que dice la verdad de cada partido jugado es su ACTA, y las actas se descargan poco
 *    a poco: cada pasada recupera más calendario que la anterior.
 * 3. Lo ya importado con el calendario inventado hay que RETIRARLO antes de reimportar, o el canónico se
 *    queda con los partidos viejos y los nuevos.
 * 4. Y lo que se retira está en el diario: `pnpm importar --revertir <lote>` lo deshace.
 *
 * ── EL DETALLE QUE COSTÓ 119 GRUPOS (§3.28) ────────────────────────────────────────────────────────────
 *
 * Las personas que el acta no publica con código —en Cataluña, todas— se identifican por (nombre +
 * inscripción + temporada). Si una inscripción se fusiona con otra, las personas ya creadas se quedan con el
 * contexto viejo y la reimportación crea personas nuevas: «participaciones 1573≠3146». Por eso, cuando hay
 * fusiones nuevas, los grupos afectados también entran en el ciclo.
 *
 * Uso:
 *   node scripts/ciclo-cataluna.mjs              · dice qué haría (no escribe nada)
 *   node scripts/ciclo-cataluna.mjs --aplicar    · lo hace: repara, retira e importa
 *   node scripts/ciclo-cataluna.mjs --solo-reparar --aplicar
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIARIO_REPARACIONES = join(RAIZ, 'pruebas', 'reconstruccion', 'reparaciones-calendario.jsonl');
const DIARIO_FUSIONES = join(RAIZ, 'pruebas', 'reconstruccion', 'fusiones-inscripciones.jsonl');
const ESTADO = join(RAIZ, 'pruebas', 'reconstruccion', 'ciclo-cataluna.json');
const LOG = join(RAIZ, 'pruebas', 'reconstruccion', 'ciclo-cataluna.log');

const argumentos = process.argv.slice(2);
const aplicar = argumentos.includes('--aplicar');
const soloReparar = argumentos.includes('--solo-reparar');

const corre = (comando, lista) => {
  try {
    return execFileSync(comando, lista, { cwd: RAIZ, encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
};

/** Última anotación por grupo del diario que se le pase, con las claves que interesan. */
function ultimoPorGrupo(ruta, accion) {
  const porGrupo = new Map();
  if (!existsSync(ruta)) return porGrupo;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    if (linea.trim() === '') continue;
    try {
      const r = JSON.parse(linea);
      if (accion !== undefined && r.accion !== accion) continue;
      porGrupo.set(String(r.grupo), r);
    } catch { /* una línea a medias de un corte no invalida el resto */ }
  }
  return porGrupo;
}

/**
 * Los grupos a reimportar: los que el diario de reparaciones tiene con MÁS partidos que la última vez que se
 * importaron (o que son nuevos), y los que tienen una fusión de inscripciones POSTERIOR a la última pasada.
 * Se guarda el estado de la pasada anterior para no reimportar en balde.
 */
function gruposQueCrecieron() {
  const previo = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : { reparados: {}, fusionados: {} };
  const ahora = ultimoPorGrupo(DIARIO_REPARACIONES, 'reparado');
  const crecidos = [...ahora].filter(([grupo, r]) => {
    const antes = previo.reparados?.[grupo];
    return antes === undefined || Number(antes) !== Number(r.partidosDespues ?? 0);
  }).map(([grupo, r]) => ({ grupo, temporada: r.temporada, motivo: 'calendario reparado o crecido' }));

  /*
   * Las fusiones se comparan por FECHA, no por presencia: un mismo grupo puede partirse y fusionarse otra
   * vez en una pasada posterior, y con una lista de nombres ya vistos ese segundo caso se perdería.
   */
  const fusionesAhora = new Map();
  if (existsSync(DIARIO_FUSIONES)) {
    for (const linea of readFileSync(DIARIO_FUSIONES, 'utf8').split(/\r?\n/)) {
      if (linea.trim() === '') continue;
      try {
        const r = JSON.parse(linea);
        const clave = String(r.grupo);
        const cuando = String(r.cuando ?? '');
        const anterior = fusionesAhora.get(clave);
        if (anterior === undefined || cuando > anterior.cuando) fusionesAhora.set(clave, { cuando, temporada: r.temporada ?? null });
      } catch { /* línea rota */ }
    }
  }
  const fusionadasAntes = previo.fusionados ?? {};
  const fusionados = [...fusionesAhora].filter(([grupo, f]) => {
    const antes = fusionadasAntes[grupo];
    return antes === undefined || String(antes) < f.cuando;
  }).map(([grupo, f]) => ({ grupo, temporada: f.temporada, motivo: 'se fusionaron dos inscripciones del grupo' }));

  return {
    crecidos,
    fusionados,
    instantanea: {
      reparados: Object.fromEntries([...ahora].map(([g, r]) => [g, Number(r.partidosDespues ?? 0)])),
      fusionados: Object.fromEntries([...fusionesAhora].map(([g, f]) => [g, f.cuando])),
    },
  };
}

const previo = existsSync(ESTADO) ? JSON.parse(readFileSync(ESTADO, 'utf8')) : { reparados: {}, fusionados: {} };

console.log(`${aplicar ? 'CICLO' : 'SIMULACIÓN DEL CICLO'} de Cataluña · reparar desde las actas e importar`);

/*
 * ── EL ORDEN IMPORTA (y me costó una pasada en balde) ──────────────────────────────────────────────────
 *
 * Primero se REPARA la cola, y sólo después se mira qué grupos han cambiado. Al revés —comparar el diario
 * antes de reparar— el ciclo decía «0 grupos» justo cuando acababa de reparar 338: los recién reparados no
 * estaban todavía en el diario que había leído.
 */
const reparacion = corre('node', ['scripts/repara-calendario-cataluna.mjs', ...(aplicar ? ['--aplicar'] : [])]);
const resumenReparacion = reparacion.split(/\r?\n/).find((l) => /grupos reparables/.test(l))?.trim() ?? '(sin resumen)';
console.log(`  ${resumenReparacion}`);

const { crecidos, fusionados, instantanea } = gruposQueCrecieron();
const aTrabajar = [...crecidos, ...fusionados.filter((f) => !crecidos.some((c) => c.grupo === f.grupo))];
console.log(`  ${crecidos.length} grupo(s) con el calendario reparado o crecido desde la última pasada`);
console.log(`  ${fusionados.length} grupo(s) con inscripciones fusionadas (hay que reconstruir sus personas)`);
console.log(`  ${aTrabajar.length} grupo(s) a retirar e importar`);

if (!aplicar) {
  const reparables = Number(/(\d+)\s+grupos reparables/.exec(resumenReparacion)?.[1] ?? 0);
  if (reparables > 0 && aTrabajar.length === 0) {
    console.log(`    (los diarios no han cambiado todavía: al aplicar, esos ${reparables} grupos reparados entran en el ciclo)`);
  }
  for (const g of aTrabajar.slice(0, 10)) console.log(`    · g${g.grupo} ${g.temporada ?? ''} — ${g.motivo}`);
  if (aTrabajar.length > 10) console.log(`    … y ${aTrabajar.length - 10} más`);
  console.log('\n  (simulación: la cola NO se ha tocado y no se ha importado nada; añade --aplicar para hacerlo)');
  process.exit(0);
}

appendFileSync(LOG, `=== ${new Date().toISOString()} · ${aTrabajar.length} grupo(s) ===\n`, 'utf8');
appendFileSync(LOG, `${resumenReparacion}\n`, 'utf8');

if (soloReparar) {
  console.log('\n  --solo-reparar: no se toca el canónico. Para importar, vuelve a lanzarlo sin esa opción.');
  process.exit(0);
}

/* 2. El canónico: retirar lo que decía el calendario inventado e importar lo de verdad. */
let ok = 0;
let fallos = 0;
for (const g of aTrabajar) {
  const temporada = /^\d{4}-\d{2}$/.test(String(g.temporada)) ? String(g.temporada) : null;
  if (temporada === null) {
    appendFileSync(LOG, `[${g.grupo}] sin temporada legible: no se importa\n`, 'utf8');
    fallos += 1;
    continue;
  }
  const prepara = corre('node', ['scripts/prepara-lote-retirada-grupo.mjs', '--federacion', 'cataluna', '--grupo', String(g.grupo), '--temporada', temporada]);
  if (prepara.includes('lote preparado')) {
    const lote = /retirada-calendario-reparado-[0-9T-]+\.json/.exec(prepara)?.[0];
    if (lote !== undefined) {
      const retirada = corre('pnpm', ['importar', '--retirar', join(RAIZ, 'pruebas', 'reconstruccion', 'canonico', lote), '--aplicar']);
      appendFileSync(LOG, `[${g.grupo} ${temporada}] ${(/lote \d+: \d+ filas retiradas/.exec(retirada)?.[0] ?? 'retirada sin confirmar')}\n`, 'utf8');
    }
  }
  const importacion = corre('pnpm', ['importar', '--federacion', 'cataluna', '--temporada', temporada, '--grupo', String(g.grupo)]);
  const resumen = /RESUMEN:.*/.exec(importacion)?.[0]?.trim();
  if (resumen !== undefined) ok += 1; else fallos += 1;
  appendFileSync(LOG, `[${g.grupo} ${temporada}] ${resumen ?? (/✗[^\n]*/.exec(importacion)?.[0]?.trim() ?? '(sin resumen)')}\n`, 'utf8');
}

/* 3. La instantánea, para que la próxima pasada sepa qué ha cambiado. */
const { instantanea: nueva } = gruposQueCrecieron();
import('node:fs').then(({ writeFileSync }) => {
  writeFileSync(ESTADO, `${JSON.stringify({ cuando: new Date().toISOString(), ...nueva }, null, 1)}\n`, 'utf8');
});

appendFileSync(LOG, `=== fin ${new Date().toISOString()} · ${ok} importados · ${fallos} sin resumen ===\n`, 'utf8');
console.log(`\n  ${ok} grupo(s) importados · ${fallos} sin resumen`);
console.log(`  diario del ciclo: ${ESTADO.replace(`${RAIZ}\\`, '')}`);
console.log('  y para ver el efecto:  pnpm importar:estado');
