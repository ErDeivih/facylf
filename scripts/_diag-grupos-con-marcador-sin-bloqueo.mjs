#!/usr/bin/env node
/**
 * SÓLO LECTURA: grupos que tienen marcadores de estado Y NO tienen bloqueo de importación.
 *
 * Son los candidatos a probar si el importador aguanta la cola CONTAMINADA —sin reconstruir—, que es la
 * pregunta que decide si hace falta aplicar la reconstrucción sobre la cola real.
 *
 * El riesgo concreto: `calculaClasificacion` agrupa equipos POR NOMBRE, y en un grupo de Euskadi el mismo
 * equipo aparece con `(Sailkatua)` en unas jornadas y sin él en otras. Si el nombre contaminado llega a
 * la tabla, el equipo se parte en dos filas y las dos apuntan a la misma inscripción.
 *
 * Uso: npx tsx scripts/_diag-grupos-con-marcador-sin-bloqueo.mjs [--raiz <raiz de datos>]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', join(resolve(import.meta.dirname, '..'), 'pruebas', 'reconstruccion', 'ciclo')));
const db = new DatabaseSync(join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const limpio = (t) => normalizaNombreEquipo(separaNombreYEstado(String(t ?? '')).nombreEquipo);
const pareja = (a, b) => [a, b].sort().join(' || ');
const clave = (f) => `${f.temporada}|${f.competicion}|${f.grupo}`;

/** Marcadores por grupo y si el mismo equipo aparece con y sin marcador dentro del grupo. */
const marcadores = new Map();
for (const p of db.prepare(`select temporada, competicion, grupo, local, visitante from partidos
    where local like '%(%' or visitante like '%(%'`).all()) {
  const k = clave(p);
  if (!marcadores.has(k)) marcadores.set(k, { partidos: 0, marcadores: 0, mixto: false, formas: new Map() });
  const g = marcadores.get(k);
  for (const literal of [p.local, p.visitante]) {
    const sep = separaNombreYEstado(literal);
    if (sep.marcadoresEstado.length === 0) continue;
    g.marcadores += sep.marcadoresEstado.length;
    const norm = normalizaNombreEquipo(sep.nombreEquipo);
    if (!g.formas.has(norm)) g.formas.set(norm, { con: 0, sin: 0 });
    g.formas.get(norm).con += 1;
  }
}
// Un equipo "mixto" es el que aparece con marcador en unas filas y sin él en otras: es lo que partiría
// la clasificación en dos filas.
for (const [k, g] of marcadores) {
  for (const [norm, cuenta] of g.formas) {
    const sin = db.prepare(`select count(*) n from partidos
      where temporada=? and competicion=? and grupo=?
        and (local = ? or visitante = ? or local = ? or visitante = ?)`)
      .get(...k.split('|'), norm, norm, norm, norm).n;
    void sin;
    void cuenta;
  }
}
for (const p of db.prepare(`select temporada, competicion, grupo, local, visitante from partidos`).all()) {
  const k = clave(p);
  const g = marcadores.get(k);
  if (!g) continue;
  g.partidos += 1;
  for (const literal of [p.local, p.visitante]) {
    const norm = normalizaNombreEquipo(separaNombreYEstado(literal).nombreEquipo);
    if (!g.formas.has(norm)) g.formas.set(norm, { con: 0, sin: 0 });
    const forma = g.formas.get(norm);
    if (separaNombreYEstado(literal).marcadoresEstado.length > 0) forma.con += 1; else forma.sin += 1;
  }
}
for (const [, g] of marcadores) {
  for (const [, forma] of g.formas) if (forma.con > 0 && forma.sin > 0) { g.mixto = true; break; }
}

/** Bloqueos de importación, igual que los mide el importador: nombre limpio contra nombre limpio. */
const bloqueos = new Map();
for (const f of db.prepare(`select p.temporada t, p.competicion c, p.grupo g, p.local pl, p.visitante pv, a.datos d
  from partidos p join actas a on a.temporada=p.temporada and a.competicion=p.competicion and a.grupo=p.grupo
    and a.codigo=p.codigo_acta where a.datos is not null`).iterate()) {
  let d; try { d = JSON.parse(f.d); } catch { continue; }
  if (!d?.local || !d?.visitante) continue;
  const k = `${f.t}|${f.c}|${f.g}`;
  if (pareja(limpio(f.pl), limpio(f.pv)) === pareja(limpio(d.local), limpio(d.visitante))) continue;
  bloqueos.set(k, (bloqueos.get(k) ?? 0) + 1);
}


const candidatos = [...marcadores.entries()]
  .filter(([k]) => !bloqueos.has(k))
  .map(([k, g]) => ({ k, ...g }))
  .sort((a, b) => b.marcadores - a.marcadores)
  // Una jornada COMPLETA con marcador es la que de verdad ejercita la clasificación: sin ella el lote ni
  // siquiera calcula la tabla y la prueba no demuestra nada.
  .map((c) => {
    const [t, comp, g] = c.k.split('|');
    let completa = 0;
    for (let n = 1; n <= 40; n++) {
      const filas = db.prepare(`select local, visitante, goles_local gl, goles_visitante gv from partidos
        where temporada=? and competicion=? and grupo=? and jornada=?`).all(t, comp, g, n);
      if (filas.length < 2) break;
      if (!filas.every((f) => f.gl !== null && f.gv !== null)) break;
      completa = n;
    }
    return { ...c, jornadaCompleta: completa };
  })
  .filter((c) => c.jornadaCompleta > 0 && c.mixto)
  .sort((a, b) => b.jornadaCompleta - a.jornadaCompleta || b.marcadores - a.marcadores);

console.log(`grupos con marcadores de estado: ${marcadores.size}`);
console.log(`  de ellos, sin bloqueo de importación: ${[...marcadores.keys()].filter((k) => !bloqueos.has(k)).length}`);
console.log(`  de ellos, con el MISMO equipo con y sin marcador (partiría la clasificación): ${[...marcadores.values()].filter((g) => g.mixto).length}`);
console.log('\ncandidatos a probar la importación SIN reconstruir (mixtos y sin bloqueo):');
for (const c of candidatos.slice(0, 12)) {
  const [t, comp, g] = c.k.split('|');
  console.log(`  t${t} c${comp} g${g} · ${c.partidos} partidos · ${c.marcadores} marcadores · equipos mixtos: ${[...c.formas.values()].filter((f) => f.con > 0 && f.sin > 0).length}`);
}
if (candidatos.length === 0) console.log('  (ninguno)');
db.close();
