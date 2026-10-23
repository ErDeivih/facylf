#!/usr/bin/env node
/*
 * FILAS DE CALENDARIO DONDE UN EQUIPO JUEGA CONTRA SÃ MISMO.
 *
 * Por quÃ© existe. Persiguiendo los grupos de AndalucÃ­a que no se importan saliÃ³ otra cosa debajo: en el grupo
 * 38111 de Castilla y LeÃ³n la jornada 1 tiene una fila que dice
 *
 *     Â«U.D. San Lorenzo C.D.Â» (cÃ³digo 8096) vs Â«U.D. San Lorenzo C.D.Â» (cÃ³digo 16954) Â· 0-2
 *
 * Es decir, el mismo equipo en los dos lados. Eso no existe en ninguna liga, y la base lo rechaza
 * (`match_equipos_distintos_check`). El problema no es el rechazo â€”hace bienâ€” sino que **una fila asÃ­ tumba el
 * grupo entero**: 190 partidos buenos se quedan fuera por uno imposible.
 *
 * Se cuentan dos cosas distintas, que se arreglan distinto:
 *   Â· mismo NOMBRE en los dos lados (con o sin cÃ³digo): la fuente publicÃ³ una fila mal;
 *   Â· mismo CÃ“DIGO en los dos lados: ademÃ¡s el cÃ³digo estÃ¡ repetido.
 *
 * Y se distingue si la fila lleva algo de un partido (marcador, acta) o es una plantilla vacÃ­a.
 *
 * SÃ“LO LEE. Uso: node scripts/mide-partidos-imposibles.mjs [federacion]
 */
import { createRequire } from 'node:module';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA = join(RAIZ, 'pruebas', 'reconstruccion', 'partidos-imposibles.json');
const filtro = process.argv[2] ?? null;

const PALABRAS_DESCANSO = ['descansa', 'descans', 'atsedena'];
const normaliza = (texto) => String(texto ?? '').replace(/\([^)]*\)/g, ' ')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const esDescanso = (texto) => PALABRAS_DESCANSO.includes(normaliza(texto).toLowerCase());

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

const detalle = [];
for (const cola of colas()) {
  const db = new DatabaseSync(cola.ruta, { readOnly: true });
  let filas = [];
  try {
    filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, local, visitante,
        equipo_local_codigo, equipo_visitante_codigo, goles_local, goles_visitante, codigo_acta from partidos`).all();
  } catch (error) {
    console.error(`  ${cola.federacion}: no se pudo leer (${error.message})`);
  } finally { db.close(); }

  const imposibles = [];
  const grupos = new Set();
  for (const f of filas) {
    if (esDescanso(f.local) || esDescanso(f.visitante)) continue;
    const mismoNombre = normaliza(f.local) !== '' && normaliza(f.local) === normaliza(f.visitante);
    const codLocal = String(f.equipo_local_codigo ?? '').trim();
    const codVisitante = String(f.equipo_visitante_codigo ?? '').trim();
    const mismoCodigo = codLocal !== '' && codLocal === codVisitante;
    if (!mismoNombre && !mismoCodigo) continue;
    grupos.add(`${f.temporada}|${f.competicion}|${f.grupo}`);
    imposibles.push({
      federacion: cola.federacion, temporada: f.temporada, competicion: f.competicion, grupo: f.grupo,
      jornada: f.jornada, orden: f.orden, local: f.local, visitante: f.visitante,
      mismoNombre, mismoCodigo, codigos: `${codLocal || '-'}/${codVisitante || '-'}`,
      conMarcador: f.goles_local !== null || f.goles_visitante !== null,
      conActa: f.codigo_acta !== null,
    });
  }
  if (imposibles.length) {
    console.log(`  ${cola.federacion.padEnd(20)} ${String(grupos.size).padStart(5)} grupos Â· `
      + `${String(imposibles.length).padStart(4)} filas imposibles Â· `
      + `${imposibles.filter((i) => i.mismoCodigo).length} con el cÃ³digo repetido Â· `
      + `${imposibles.filter((i) => i.conMarcador).length} con marcador`);
  }
  detalle.push(...imposibles);
}

const grupos = new Set(detalle.map((d) => `${d.federacion}|${d.temporada}|${d.grupo}`));
console.log(`\ntotal: ${detalle.length} filas en ${grupos.size} grupos Â· ${detalle.filter((d) => d.conMarcador).length} con marcador `
  + `Â· ${detalle.filter((d) => d.conActa).length} con acta citada`);
const porFederacion = {};
for (const d of detalle) {
  const p = porFederacion[d.federacion] ?? { filas: 0, grupos: new Set() };
  p.filas += 1;
  p.grupos.add(`${d.temporada}|${d.grupo}`);
  porFederacion[d.federacion] = p;
}
for (const [f, v] of Object.entries(porFederacion).sort((a, b) => b[1].filas - a[1].filas)) {
  console.log(`  ${f.padEnd(20)} ${String(v.grupos.size).padStart(4)} grupos Â· ${String(v.filas).padStart(4)} filas`);
}
console.log('\nejemplos:');
for (const d of detalle.slice(0, 10)) {
  console.log(`  ${d.federacion.padEnd(14)} ${d.temporada} g${String(d.grupo).padEnd(10)} J${d.jornada} o${d.orden}: `
    + `Â«${d.local}Â» (${d.codigos}) Â· ${d.conMarcador ? 'con marcador' : 'sin marcador'}${d.conActa ? ' Â· con acta' : ''}`);
}
writeFileSync(SALIDA, `${JSON.stringify({ cuando: new Date().toISOString(), total: detalle.length, grupos: grupos.size, detalle }, null, 2)}\n`);
console.log(`\n  el detalle en pruebas/reconstruccion/partidos-imposibles.json`);

