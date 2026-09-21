#!/usr/bin/env node
/**
 * SÓLO LECTURA: simulación de la reparación de Euskadi con la FUNCIÓN REAL, sin tocar la cola.
 *
 * Monta el catálogo de cada grupo tal y como lo montaría la reconstrucción —a partir de los equipos del
 * propio grupo que SÍ traen código, en cualquier jornada— y aplica `resuelveEquipoNova` a los dos
 * lados de cada caso incompatible: el literal del calendario (con sus marcadores) y el del acta (limpio).
 *
 * Un caso queda reparado sólo si los DOS lados resuelven a la MISMA inscripción. Si uno no resuelve o
 * resuelven a inscripciones distintas, el caso sigue ambiguo y se enseña con su evidencia.
 *
 * Uso: npx tsx scripts/_diag-simula-reparacion-nova.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parse } from 'node-html-parser';
import { resolve, join } from 'node:path';
import {
  normalizaNombreEquipo, resuelveEquipoNova, separaNombreYEstado,
} from '../packages/ingesta/src/parsers/nova-equipos.js';

const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

/** El código que la fila trae en su enlace de comparativa, si lo trae. */
const filas = db.prepare(`select a.codigo, a.temporada, a.competicion, a.grupo, a.jornada, a.datos,
    p.orden, p.local plocal, p.visitante pvisitante, p.jornada pjornada,
    p.equipo_local_codigo cl, p.equipo_visitante_codigo cv
  from actas a join partidos p on p.temporada=a.temporada and p.competicion=a.competicion
    and p.grupo=a.grupo and p.codigo_acta=a.codigo
 where a.datos is not null`).all();

/** Todos los pares (nombre, código) de cada grupo y temporada: el catálogo del ámbito. */
const pares = new Map(); // temporada|competicion|grupo -> Map<normalizado, Set<código>>
for (const p of db.prepare('select temporada, competicion, grupo, local, visitante, equipo_local_codigo cl, equipo_visitante_codigo cv from partidos').all()) {
  const k = `${p.temporada}|${p.competicion}|${p.grupo}`;
  if (!pares.has(k)) pares.set(k, new Map());
  const mapa = pares.get(k);
  for (const [nombre, codigo] of [[p.local, p.cl], [p.visitante, p.cv]]) {
    if (!codigo) continue;
    const limpio = normalizaNombreEquipo(separaNombreYEstado(nombre).nombreEquipo);
    if (!limpio) continue;
    if (!mapa.has(limpio)) mapa.set(limpio, new Set());
    mapa.get(limpio).add(String(codigo));
  }
}

/**
 * Jerarquía 2 del encargo: el código explícito del mismo equipo en OTRA representación del mismo
 * grupo y temporada. Esa representación es la **clasificación archivada**, que publica cada equipo
 * como `NFG_VisCompeticiones_Grupo?...&codequipo=<código>` con su nombre. Medido: 178 de los 300
 * grupos con partidos sin código tienen esos enlaces (2.376 pares código→nombre).
 */
const leerArchivo = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};
const dirDe = (temporada, competicion, grupo) => {
  for (const t of readdirSync(base)) {
    if (!t.startsWith(`t${temporada}-`)) continue;
    const p = join(base, t, `comp-${competicion}`, `grupo-${grupo}`);
    if (existsSync(p)) return p;
  }
  return null;
};
const paresDeClasificacion = new Map();
const conClasificacion = new Set();
const sinEnlaces = new Set();
for (const k of pares.keys()) {
  const [temporada, competicion, grupo] = k.split('|');
  const dir = dirDe(temporada, competicion, grupo);
  const html = dir ? leerArchivo(join(dir, 'clasificacion.html')) : null;
  if (!html) continue;
  const raizHtml = parse(html);
  const encontrados = new Map();
  for (const a of raizHtml.querySelectorAll('a[href*="codequipo="]')) {
    const m = /codequipo=(\d+)/i.exec(a.getAttribute('href') ?? '');
    const nombre = a.text.replace(/\s+/g, ' ').trim();
    if (m && nombre) encontrados.set(normalizaNombreEquipo(separaNombreYEstado(nombre).nombreEquipo), m[1]);
  }
  if (encontrados.size === 0) { sinEnlaces.add(k); continue; }
  conClasificacion.add(k);
  paresDeClasificacion.set(k, encontrados);
}

/** Todos los literales de equipo de cada grupo: la base del enlace por referencia contextual. */
const literalesDelGrupo = new Map();
for (const p of db.prepare('select temporada, competicion, grupo, local, visitante from partidos').all()) {
  const k = `${p.temporada}|${p.competicion}|${p.grupo}`;
  if (!literalesDelGrupo.has(k)) literalesDelGrupo.set(k, new Set());
  literalesDelGrupo.get(k).add(p.local);
  literalesDelGrupo.get(k).add(p.visitante);
}

const catalogoDe = (temporada, competicion, grupo) => {
  const clave = `${temporada}|${competicion}|${grupo}`;
  const mapa = pares.get(clave) ?? new Map();
  const inscripcionPorCodigo = new Map();
  const inscripcionPorNombreLimpio = new Map();
  for (const [limpio, codigos] of mapa) {
    if (codigos.size !== 1) continue; // dos códigos para un nombre limpio: ambiguo, no entra
    const codigo = [...codigos][0];
    inscripcionPorCodigo.set(codigo, codigo);
    inscripcionPorNombreLimpio.set(limpio, codigo);
  }
  // La clasificación del grupo aporta la relación código → nombre que el calendario no trae.
  const deClasificacion = paresDeClasificacion.get(clave) ?? new Map();
  for (const [limpio, codigo] of deClasificacion) {
    if (!inscripcionPorCodigo.has(codigo)) inscripcionPorCodigo.set(codigo, codigo);
    // Si el calendario ya dio otra inscripción para ese nombre limpio, no se pisa: manda el calendario.
    if (!inscripcionPorNombreLimpio.has(limpio)) inscripcionPorNombreLimpio.set(limpio, codigo);
  }
  // Cuando la fuente NO publica ningún código para el grupo (ni en el calendario ni en la
  // clasificación), la inscripción se enlaza por REFERENCIA CONTEXTUAL: temporada + competición +
  // grupo + nombre limpio. No se fabrica un código federativo, que es lo que el encargo prohíbe. Sólo
  // entra si el nombre limpio identifica a UN solo literal del grupo: si dos formas distintas
  // normalizan igual, el nombre es ambiguo y no se usa.
  const literalesPorLimpio = new Map();
  for (const literal of literalesDelGrupo.get(clave) ?? []) {
    const limpio = normalizaNombreEquipo(separaNombreYEstado(literal).nombreEquipo);
    if (!limpio) continue;
    if (!literalesPorLimpio.has(limpio)) literalesPorLimpio.set(limpio, new Set());
    literalesPorLimpio.get(limpio).add(literal);
  }
  for (const [limpio, literales] of literalesPorLimpio) {
    if (inscripcionPorNombreLimpio.has(limpio)) continue; // ya resuelto con código: mejor
    // Que dos literales den el mismo nombre limpio NO es ambigüedad: `(Sailkatua) BEASAIN S.D.` y
    // `BEASAIN S.D.` son el MISMO equipo, y por eso precisamente se separa el marcador. La ambigüedad
    // de verdad —un nombre limpio con DOS códigos— ya la descarta la pasada anterior. Lo que sí hay que
    // comprobar es que los literales no difieran en nada más que el marcador: si difieren, detrás hay
    // dos equipos distintos y el nombre no sirve.
    const sinMarcador = new Set([...literales].map((l) => separaNombreYEstado(l).nombreEquipo));
    if (sinMarcador.size !== 1) continue;
    inscripcionPorNombreLimpio.set(limpio, `contexto:${clave}|${limpio}`);
  }
  return { inscripcionPorCodigo, inscripcionPorNombreLimpio };
};

let incompatibles = 0, reparados = 0, ambiguos = 0, sinMarcador = 0;
const residuales = [];
const porMarcador = new Map();
let catalogoVacio = 0;
const gruposAfectados = new Set();

for (const f of filas) {
  let d; try { d = JSON.parse(f.datos); } catch { continue; }
  if (!d?.local || !d?.visitante) continue;
  const cL = normalizaNombreEquipo(f.plocal), cV = normalizaNombreEquipo(f.pvisitante);
  const aL = normalizaNombreEquipo(d.local), aV = normalizaNombreEquipo(d.visitante);
  if (cL === aL && cV === aV) continue;
  if (cL === aV && cV === aL) continue;
  if (cV === aL && cL !== aL && cL !== aV) continue;
  incompatibles++;

  const catalogo = catalogoDe(f.temporada, f.competicion, f.grupo);
  if (catalogo.inscripcionPorNombreLimpio.size === 0) catalogoVacio++;

  const calLocal = resuelveEquipoNova({ literal: f.plocal, codigoExplicito: f.cl }, catalogo);
  const calVisit = resuelveEquipoNova({ literal: f.pvisitante, codigoExplicito: f.cv }, catalogo);
  const actaLocal = resuelveEquipoNova({ literal: d.local, codigoExplicito: null }, catalogo);
  const actaVisit = resuelveEquipoNova({ literal: d.visitante, codigoExplicito: null }, catalogo);

  const marcadores = [...separaNombreYEstado(f.plocal).marcadoresEstado, ...separaNombreYEstado(f.pvisitante).marcadoresEstado];
  if (marcadores.length === 0) sinMarcador++;
  for (const m of marcadores) porMarcador.set(m, (porMarcador.get(m) ?? 0) + 1);

  // Reparado: la pareja del calendario y la del acta resuelven a las MISMAS dos inscripciones.
  const parCalendario = [calLocal.inscripcion, calVisit.inscripcion].join(' || ');
  const parActa = [actaLocal.inscripcion, actaVisit.inscripcion].join(' || ');
  const todasResueltas = [calLocal, calVisit, actaLocal, actaVisit].every((r) => r.inscripcion !== null);
  if (todasResueltas && parCalendario === parActa) {
    reparados++;
    gruposAfectados.add(`${f.temporada}|${f.competicion}|${f.grupo}`);
  } else {
    ambiguos++;
    if (residuales.length < 16) {
      residuales.push(`${f.temporada} c${f.competicion} g${f.grupo} J${f.pjornada} ord ${f.orden} · acta ${f.codigo}\n`
        + `      calendario: «${f.plocal}» vs «${f.pvisitante}»  → ${JSON.stringify([calLocal.via, calVisit.via])}\n`
        + `      acta:       «${d.local}» vs «${d.visitante}»  → ${JSON.stringify([actaLocal.via, actaVisit.via])}\n`
        + `      marcadores: ${JSON.stringify(marcadores)} · fuera de posición: ${JSON.stringify([...calLocal.marcadoresFueraDePosicion, ...calVisit.marcadoresFueraDePosicion])}`
        + ` · desconocidos: ${JSON.stringify([...new Set([...calLocal.marcadoresDesconocidos, ...calVisit.marcadoresDesconocidos])])}`);
    }
  }
}

console.log(`casos incompatibles en Euskadi: ${incompatibles}`);
console.log(`  grupos con clasificacion aprovechable .....: ${conClasificacion.size} · sin enlaces codequipo: ${sinEnlaces.size}`);
console.log(`  reparados (los dos lados resuelven a la MISMA inscripción): ${reparados}`);
console.log(`  siguen ambiguos ...........................................: ${ambiguos}`);
console.log(`  sin ningún marcador de estado en el calendario ............: ${sinMarcador}`);
console.log(`  casos en grupos cuyo catálogo quedó VACÍO (sin ningún código): ${catalogoVacio}`);
console.log(`  grupos de Euskadi afectados: ${gruposAfectados.size}`);
console.log(`\nmarcadores de estado efectivamente quitados:`);
for (const [m, n] of [...porMarcador.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${m.padEnd(16)} ${n}`);
console.log(`\n--- casos que siguen ambiguos ---`);
for (const r of residuales) console.log(`  ${r}`);
db.close();
