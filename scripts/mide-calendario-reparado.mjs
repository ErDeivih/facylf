#!/usr/bin/env node
/*
 * MIDE SI EL CALENDARIO REPARADO DE UN GRUPO ES EL GRUPO ENTERO O SÓLO UN FRAGMENTO.
 *
 * Por qué. `repara-calendario-cataluna.mjs` sustituye todos los partidos del grupo por **los que tienen
 * acta archivada**. Es lo único verificable que hay, pero tiene un filo: si el grupo tenía 240 partidos y
 * sólo 16 actas descargadas, el calendario reparado son 16 partidos. El importador lo acepta, avisa de que
 * «N de M equipos juegan un número de partidos distinto del habitual» y lo anota en
 * `ops.normalizacion_error` — pero una consulta que pregunte «cuántos partidos jugó este equipo» responde
 * 1 donde la verdad publicada son 30, y eso es justo lo que el canónico no debe permitir en silencio.
 *
 * Esta herramienta dice, grupo a grupo, cuál de los dos casos es:
 *
 *   COMPLETO   · todos los equipos juegan el mismo número de partidos. Es lo que hace una liga regular.
 *   FRAGMENTO  · no. Falta calendario: sólo están los partidos con acta.
 *   SIN EQUIPOS · el grupo no tiene partidos utilizables.
 *
 * No escribe nada. Uso:
 *   node scripts/mide-calendario-reparado.mjs                     · todos los grupos reparados del diario
 *   node scripts/mide-calendario-reparado.mjs --federacion cataluna
 *   node scripts/mide-calendario-reparado.mjs --json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIARIO = join(RAIZ, 'pruebas', 'reconstruccion', 'reparaciones-calendario.jsonl');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'calendarios-reparados.json');

/** Cola de cada federación. Castilla y León usa el directorio sin sufijo; el resto lo lleva en el nombre. */
function colaDe(federacion) {
  const candidatas = [
    join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'),
    join(RAIZ, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'),
  ];
  return candidatas.find((c) => existsSync(c)) ?? null;
}

const argumentos = process.argv.slice(2);
const arg = (nombre) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : null;
};
const quiereJson = argumentos.includes('--json');
const federacionPedida = arg('federacion');

if (!existsSync(DIARIO)) {
  console.error(`No hay diario de reparaciones en ${DIARIO}: nada que medir.`);
  process.exit(1);
}

/** Última anotación por (federación, grupo): el diario es acumulativo y un grupo puede repararse dos veces. */
const reparados = new Map();
for (const linea of readFileSync(DIARIO, 'utf8').split(/\r?\n/)) {
  if (linea.trim() === '') continue;
  let fila;
  try { fila = JSON.parse(linea); } catch { continue; }
  if (fila.accion !== 'reparado') continue;
  reparados.set(`${fila.federacion ?? 'cataluna'}|${fila.grupo}`, fila);
}

const porFederacion = new Map();
for (const [clave, fila] of reparados) {
  const federacion = clave.split('|')[0];
  if (federacionPedida && federacion !== federacionPedida) continue;
  if (!porFederacion.has(federacion)) porFederacion.set(federacion, []);
  porFederacion.get(federacion).push(fila);
}

/**
 * Cuenta los partidos de cada equipo de un grupo. Sólo los utilizables: las filas de descanso y las
 * imposibles (`local` y `visitante` con el mismo nombre o el mismo código) no son partidos de nadie, y
 * contarlas inflaría a quien no jugó. Misma regla que `origen/cola.ts`.
 */
function cuentaPorEquipo(db, grupo) {
  const filas = db.prepare(`select local, visitante, jornada from partidos
    where grupo = ? and local is not null and visitante is not null`).all(grupo);
  const equipos = new Map();
  const jornadas = new Set();
  let partidos = 0;
  for (const f of filas) {
    const local = String(f.local).trim();
    const visitante = String(f.visitante).trim();
    if (local.toUpperCase() === visitante.toUpperCase()) continue;
    partidos += 1;
    jornadas.add(Number(f.jornada));
    equipos.set(local, (equipos.get(local) ?? 0) + 1);
    equipos.set(visitante, (equipos.get(visitante) ?? 0) + 1);
  }
  const cuentas = [...equipos.values()];
  const habitual = cuentas.length ? cuentas.sort((a, b) => b - a)[0] : 0;
  const desviados = cuentas.filter((n) => n !== habitual).length;
  return { partidos, equipos: equipos.size, jornadas: jornadas.size, maxPorEquipo: habitual, desviados };
}

const medidos = [];
for (const [federacion, filas] of porFederacion) {
  const cola = colaDe(federacion);
  if (cola === null) {
    console.error(`  ⚠ sin cola para ${federacion}: ${filas.length} grupo(s) sin medir`);
    continue;
  }
  const db = new DatabaseSync(cola, { readOnly: true });
  for (const fila of filas) {
    const c = cuentaPorEquipo(db, fila.grupo);
    const estado = c.partidos === 0 || c.equipos < 2 ? 'sin-equipos' : (c.desviados === 0 ? 'completo' : 'fragmento');
    medidos.push({
      federacion, grupo: fila.grupo, temporada: fila.temporada,
      partidosInventados: fila.partidosAntes ?? null,
      partidos: c.partidos, equipos: c.equipos, jornadas: c.jornadas,
      maxPorEquipo: c.maxPorEquipo, equiposDesviados: c.desviados, estado,
    });
  }
  db.close();
}

const cuenta = (estado) => medidos.filter((m) => m.estado === estado);
const completos = cuenta('completo');
const fragmentos = cuenta('fragmento');
const vacios = cuenta('sin-equipos');

const salida = {
  cuando: new Date().toISOString(),
  resumen: {
    grupos: medidos.length,
    completos: completos.length,
    fragmentos: fragmentos.length,
    sinEquipos: vacios.length,
    partidosEnFragmentos: fragmentos.reduce((n, m) => n + m.partidos, 0),
  },
  grupos: medidos.sort((a, b) => b.partidos - a.partidos),
};
writeFileSync(SALIDA, `${JSON.stringify(salida, null, 1)}\n`, 'utf8');

if (quiereJson) {
  console.log(JSON.stringify(salida, null, 1));
} else {
  console.log(`CALENDARIOS REPARADOS · ${medidos.length} grupo(s) medidos`);
  console.log(`  ${completos.length} COMPLETO(S): todos los equipos juegan lo mismo`);
  console.log(`  ${fragmentos.length} FRAGMENTO(S): falta calendario (sólo están los partidos con acta)`);
  if (vacios.length) console.log(`  ${vacios.length} sin equipos utilizables`);
  if (fragmentos.length) {
    console.log('\n  fragmentos, de más a menos partidos:');
    for (const f of fragmentos.slice(0, 15)) {
      console.log(`    g${String(f.grupo).padEnd(10)} ${f.temporada} · ${String(f.partidos).padStart(4)} partidos · `
        + `${f.equipos} equipos · el que más juega: ${f.maxPorEquipo} · desviados: ${f.equiposDesviados}`
        + ` · inventados antes: ${f.partidosInventados}`);
    }
    if (fragmentos.length > 15) console.log(`    … y ${fragmentos.length - 15} más (están todos en el JSON)`);
  }
  console.log(`\n  anotado en ${SALIDA.replace(`${RAIZ}\\`, '')}`);
}
