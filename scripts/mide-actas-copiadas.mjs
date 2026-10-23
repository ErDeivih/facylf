#!/usr/bin/env node
/*
 * MIDE, EN TODAS LAS COLAS, CUÁNTAS FILAS DE ACTA SON COPIAS DE LA MISMA ACTA.
 *
 * Por qué. El defecto del extractor de Cataluña (§3.11 de la guía) guardó las actas de una jornada bajo todas
 * las demás: la cola quedó con 144.064 filas de acta para 14.460 actas distintas, y el recolector con 131.088
 * «trabajos de acta» que eran la misma descarga repetida. Eso no es sólo ruido: cada repetición reescribe las
 * alineaciones de su jornada, y por eso la reparación del calendario se deshacía sola (grupo 55458432,
 * reparado a las 22:37 y otra vez con participaciones duplicadas a las 00:50).
 *
 * El código del acta es su identidad, así que dentro de un grupo dos filas con el mismo código son la MISMA
 * acta. Esta herramienta no arregla nada: mide cuántas sobran en cada cola, para saber si el defecto es de
 * Cataluña o de todas. Escribe `pruebas/reconstruccion/actas-copiadas.json`.
 *
 * Uso:
 *   node scripts/mide-actas-copiadas.mjs
 *   node scripts/mide-actas-copiadas.mjs --federacion cataluna --json
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'actas-copiadas.json');

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const quiereJson = argumentos.includes('--json');
const federacionPedida = arg('federacion');

/** Todas las colas del repositorio, con el nombre de federación que se deduce del directorio. */
function colas() {
  return readdirSync(RAIZ, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith('descargas-'))
    .map((e) => ({
      federacion: e.name === 'descargas-federacion' ? 'castilla-leon' : e.name.replace('descargas-', ''),
      ruta: join(RAIZ, e.name, 'recolector-local', 'cola-v2.sqlite'),
    }))
    .filter((c) => existsSync(c.ruta))
    .filter((c) => !federacionPedida || c.federacion === federacionPedida);
}

const medidos = [];
for (const cola of colas()) {
  const db = new DatabaseSync(cola.ruta, { readOnly: true });
  const uno = (sql, ...p) => db.prepare(sql).get(...p)?.n ?? 0;
  const filas = uno('select count(*) n from actas');
  const distintas = uno('select count(*) n from (select distinct grupo, codigo from actas)');
  const hechas = uno("select count(*) n from actas where estado = 'hecha'");
  const copias = filas - distintas;

  /*
   * El trabajo encolado que sobra. Hay un trabajo por fila de acta, y el código del acta identifica la
   * descarga: los trabajos que sobran son los que repiten (grupo, acta). Se cuenta así, y no con un `exists`
   * correlacionado, porque en la cola de Cataluña son 144.064 filas y el `exists` por fila no termina.
   */
  const trabajosActas = uno("select count(*) n from trabajos where tipo = 'acta'");
  const trabajosDeActasDistintas = uno("select count(*) n from (select distinct grupo, acta from trabajos where tipo = 'acta')");
  const trabajosCopiados = trabajosActas - trabajosDeActasDistintas;
  const trabajosPendientes = uno("select count(*) n from trabajos where tipo = 'acta' and estado in ('pendiente','bloqueado')");

  /* Escala del defecto: grupos con más filas de acta que actas distintas. */
  const grupos = db.prepare(`select count(*) n from (
      select grupo from actas group by grupo having count(*) > count(distinct codigo))`).get().n;

  medidos.push({
    federacion: cola.federacion, filasDeActa: filas, actasDistintas: distintas, copias,
    filasHechas: hechas, gruposConCopias: grupos, trabajosDeActaPendientes: trabajosPendientes, trabajosCopiados,
  });
  db.close();
  console.error(`  · ${cola.federacion}: ${filas} filas · ${distintas} actas · ${copias} copias`);
}

const total = (campo) => medidos.reduce((n, m) => n + m[campo], 0);
const salida = {
  cuando: new Date().toISOString(),
  totales: {
    colas: medidos.length,
    filasDeActa: total('filasDeActa'),
    actasDistintas: total('actasDistintas'),
    copias: total('copias'),
    gruposConCopias: total('gruposConCopias'),
    trabajosDeActaPendientes: total('trabajosDeActaPendientes'),
    trabajosCopiados: total('trabajosCopiados'),
  },
  colas: medidos.sort((a, b) => b.copias - a.copias),
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 1)}\n`, 'utf8');

if (quiereJson) {
  console.log(JSON.stringify(salida, null, 1));
} else {
  console.log('ACTAS COPIADAS EN LAS COLAS · el código del acta es su identidad');
  console.log('  federación          filas    actas   copias  grupos  trabajos  de ellos copiados');
  for (const m of salida.colas) {
    console.log(`  ${m.federacion.padEnd(18)} ${String(m.filasDeActa).padStart(7)} ${String(m.actasDistintas).padStart(7)} `
      + `${String(m.copias).padStart(7)} ${String(m.gruposConCopias).padStart(6)} ${String(m.trabajosDeActaPendientes).padStart(9)} `
      + `${String(m.trabajosCopiados).padStart(14)}`);
  }
  const t = salida.totales;
  console.log(`  ${'TOTAL'.padEnd(18)} ${String(t.filasDeActa).padStart(7)} ${String(t.actasDistintas).padStart(7)} `
    + `${String(t.copias).padStart(7)} ${String(t.gruposConCopias).padStart(6)} ${String(t.trabajosDeActaPendientes).padStart(9)} `
    + `${String(t.trabajosCopiados).padStart(14)}`);
  console.log(`\n  anotado en ${SALIDA.replace(`${RAIZ}\\`, '')}`);
  if (!existsSync(SALIDA)) console.log(readFileSync(SALIDA, 'utf8'));
}
