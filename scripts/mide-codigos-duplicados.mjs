#!/usr/bin/env node
/*
 * EL MISMO NOMBRE DE EQUIPO CON DOS CÓDIGOS FEDERATIVOS, EN TODAS LAS COLAS.
 *
 * Por qué existe. Nueve grupos de Andalucía no se importan porque un partido cita un código que «no está en el
 * catálogo del grupo». El motivo real, medido el 24/09/2026 en el grupo 48292831: el equipo
 * «C.D. U.D. CIUDAD DE TORREDONJIMENO» aparece en la cola con DOS códigos —2070055 y 7000222—, los dos con el
 * nombre idéntico y los dos jugando en el mismo grupo (5 partidos cada uno).
 *
 * El importador, ante dos códigos para el mismo nombre, declara el nombre AMBIGUO y no resuelve ninguno (es la
 * regla de «dos identificadores distintos para el mismo nombre = dos equipos»). En este caso no son dos
 * equipos: es uno con el código duplicado. La consecuencia es que el grupo entero se queda fuera.
 *
 * Esto mide cuánto hay de eso, que es lo que decide si merece cambiar la regla o no.
 *
 * SÓLO LEE. Uso: node scripts/mide-codigos-duplicados.mjs [federacion]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'codigos-duplicados.json');
const filtro = process.argv[2] ?? null;

function colas() {
  const salida = [];
  for (const entrada of readdirSync(RAIZ, { withFileTypes: true })) {
    if (!entrada.isDirectory() || !entrada.name.startsWith('descargas-')) continue;
    const carpeta = entrada.name;
    if (carpeta === 'descargas-federacion-sondeo' || carpeta === 'descargas-prueba-10gb') continue;
    const ruta = join(RAIZ, carpeta, 'recolector-local', 'cola-v2.sqlite');
    if (!existsSync(ruta) || existsSync(join(RAIZ, carpeta, '.PRUEBA'))) continue;
    const federacion = carpeta === 'descargas-federacion' ? 'castilla-leon' : carpeta.replace('descargas-', '');
    if (filtro && federacion !== filtro) continue;
    salida.push({ federacion, ruta });
  }
  return salida.sort((a, b) => a.federacion.localeCompare(b.federacion, 'es'));
}

/*
 * ── LAS FILAS DE DESCANSO NO CUENTAN ─────────────────────────────────────────────────────────────────────
 *
 * Medido el 24/09/2026: sin descontarlas, Cataluña aparecía con 135 grupos afectados y los casos más repetidos
 * eran «DESCANS» con 3 y 4 códigos distintos —el pseudo-equipo del descanso, que la fuente publica con varios
 * códigos y que el importador ya descarta por su nombre—. Contarlas convertía la medición en ruido.
 */
const PALABRAS_DESCANSO = ['descansa', 'descans', 'atsedena'];
const esDescanso = (texto) => {
  const limpio = String(texto ?? '').replace(/\([^)]*\)/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return PALABRAS_DESCANSO.includes(limpio);
};

const detalle = [];
for (const cola of colas()) {
  const db = new DatabaseSync(cola.ruta, { readOnly: true });
  let citas = [];
  try {
    citas = db.prepare(`
      select temporada, competicion, grupo, local, visitante, equipo_local_codigo, equipo_visitante_codigo from partidos`).all();
  } catch (error) {
    console.error(`  ${cola.federacion}: no se pudo leer (${error.message})`);
  } finally { db.close(); }

  // Nombre exacto (en mayúsculas) → conjunto de códigos, dentro de cada grupo.
  const porGrupo = new Map();
  for (const c of citas) {
    for (const [nombre, codigo] of [[c.local, c.equipo_local_codigo], [c.visitante, c.equipo_visitante_codigo]]) {
      const cod = String(codigo ?? '').trim();
      if (cod === '' || esDescanso(nombre)) continue;
      const claveGrupo = `${c.temporada}|${c.competicion}|${c.grupo}`;
      const porNombre = porGrupo.get(claveGrupo) ?? new Map();
      const entrada = porNombre.get(String(nombre).trim().toUpperCase()) ?? { codigos: new Set(), citas: 0 };
      entrada.codigos.add(cod);
      entrada.citas += 1;
      porNombre.set(String(nombre).trim().toUpperCase(), entrada);
      porGrupo.set(claveGrupo, porNombre);
    }
  }

  const filas = [];
  for (const [claveGrupo, porNombre] of porGrupo) {
    const [temporada, competicion, grupo] = claveGrupo.split('|');
    for (const [nombre, v] of porNombre) {
      if (v.codigos.size > 1) filas.push({ temporada, competicion, grupo, nombre, codigos: v.codigos.size, citas: v.citas });
    }
  }
  const grupos = new Set(filas.map((f) => `${f.temporada}|${f.grupo}`));
  if (filas.length) {
    console.log(`  ${cola.federacion.padEnd(20)} ${String(grupos.size).padStart(5)} grupos afectados · `
      + `${String(filas.length).padStart(5)} nombres con más de un código`);
  }
  for (const f of filas) detalle.push({ federacion: cola.federacion, ...f });
}

const porFederacion = {};
for (const d of detalle) {
  const p = porFederacion[d.federacion] ?? { nombres: 0, grupos: new Set() };
  p.nombres += 1;
  p.grupos.add(`${d.temporada}|${d.grupo}`);
  porFederacion[d.federacion] = p;
}
console.log(`\ntotal: ${detalle.length} nombres con más de un código en ${new Set(detalle.map((d) => `${d.federacion}|${d.temporada}|${d.grupo}`)).size} grupos`);
for (const [f, v] of Object.entries(porFederacion).sort((a, b) => b[1].nombres - a[1].nombres)) {
  console.log(`  ${f.padEnd(20)} ${String(v.grupos.size).padStart(4)} grupos · ${String(v.nombres).padStart(4)} nombres`);
}
console.log('\nlos más repetidos:');
for (const d of detalle.sort((a, b) => b.citas - a.citas).slice(0, 12)) {
  console.log(`  ${d.federacion.padEnd(14)} ${d.temporada} g${String(d.grupo).padEnd(10)} «${d.nombre.slice(0, 42)}» · `
    + `${d.codigos} códigos · ${d.citas} citas`);
}
writeFileSync(SALIDA, `${JSON.stringify({ cuando: new Date().toISOString(), total: detalle.length, detalle }, null, 2)}\n`);
console.log(`\n  el detalle en pruebas/reconstruccion/codigos-duplicados.json`);
