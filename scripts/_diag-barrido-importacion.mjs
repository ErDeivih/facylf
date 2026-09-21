#!/usr/bin/env node
/**
 * Barrido de importación EN SECO sobre muchos grupos de una copia, para encontrar fallos de verdad.
 *
 * Importar un grupo en seco hace TODO el trabajo y luego revierte: escribe partidos, actas,
 * participaciones, eventos y la clasificación, valida los recuentos contra la cola y deshace. Así que un
 * barrido en seco recorre exactamente los mismos caminos que una importación real —incluida la
 * clasificación reconstruida, que es donde apareció el defecto del equipo partido— sin dejar nada escrito.
 *
 * Uso:
 *   npx tsx scripts/_diag-barrido-importacion.mjs --grupos 7180,22610202 [--temporada 2014-15] [--raiz <copias>]
 *   npx tsx scripts/_diag-barrido-importacion.mjs --con-marcadores   # todos los grupos con marcador y sin bloqueo
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const requerir = createRequire(import.meta.url);
process.loadEnvFile(resolve(import.meta.dirname, '..', '.env'));
const { DatabaseSync } = requerir('node:sqlite');
const { importaFederacion } = await import('../packages/canonico/src/lote.js');
const { creaPool } = await import('../packages/canonico/src/destino/pool.js');

const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const raiz = resolve(arg('raiz', join(resolve(import.meta.dirname, '..'), 'pruebas', 'reconstruccion', 'ciclo')));
const rutaCola = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');

const limpio = (t) => normalizaNombreEquipo(separaNombreYEstado(String(t ?? '')).nombreEquipo);
const pareja = (a, b) => [a, b].sort().join(' || ');

const db = new DatabaseSync(rutaCola, { readOnly: true });
const etiquetas = new Map(db.prepare('select codigo, etiqueta from temporadas').all().map((t) => [t.codigo, t.etiqueta]));
const conMarcador = new Set();
for (const p of db.prepare(`select temporada, competicion, grupo from partidos where local like '%(%' or visitante like '%(%'`).all()) {
  conMarcador.add(`${p.temporada}|${p.competicion}|${p.grupo}`);
}
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
const catalogo = new Map();
for (const p of db.prepare('select temporada, competicion, grupo, count(*) n from partidos group by 1,2,3').all()) {
  catalogo.set(`${p.temporada}|${p.competicion}|${p.grupo}`, { temporada: p.temporada, competicion: p.competicion, grupo: p.grupo, partidos: p.n });
}
db.close();

let seleccion;
if (arg('grupos')) {
  const pedidos = new Set(arg('grupos').split(','));
  seleccion = [...catalogo.values()].filter((g) => pedidos.has(g.grupo));
  if (arg('temporada')) seleccion = seleccion.filter((g) => etiquetas.get(g.temporada) === arg('temporada'));
} else {
  // Los grupos con marcador y sin bloqueo: son los que ejercitan el camino del nombre contaminado.
  seleccion = [...catalogo.values()].filter((g) => conMarcador.has(`${g.temporada}|${g.competicion}|${g.grupo}`) && !bloqueos.has(`${g.temporada}|${g.competicion}|${g.grupo}`));
}
seleccion.sort((a, b) => a.partidos - b.partidos);

console.log(`barrido en seco de ${seleccion.length} grupo(s) de ${federacion} sobre la copia ${raiz}`);
const pool = creaPool();
let ok = 0;
const fallos = [];
try {
  for (const g of seleccion) {
    const etiqueta = etiquetas.get(g.temporada) ?? g.temporada;
    try {
      const informes = await importaFederacion(pool, { raiz, federacion, temporada: etiqueta, grupo: g.grupo, seco: true });
      const i = informes[0];
      if (!i || !i.validacion.ok) {
        const detalle = i ? i.validacion.diferencias.map((d) => `${d.entidad} ${d.origen}≠${d.destino}`).join(', ') : 'sin informe';
        fallos.push({ g, etiqueta, motivo: `validación: ${detalle}` });
        console.log(`  ✗ t${g.temporada} g${g.grupo} (${g.partidos} partidos) · ${detalle}`);
      } else {
        ok += 1;
        console.log(`  ✓ t${g.temporada} g${g.grupo} (${g.partidos} partidos) · ${i.milisegundos} ms · ${i.rechazadas.length} rechazadas`);
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      fallos.push({ g, etiqueta, motivo });
      console.log(`  ✗ t${g.temporada} g${g.grupo} (${g.partidos} partidos) · ${motivo.slice(0, 160)}`);
    }
  }
} finally {
  await pool.end();
}
console.log(`\n${ok}/${seleccion.length} grupos importan en seco sin ninguna pega`);
if (fallos.length) {
  console.log('fallos:');
  for (const f of fallos) console.log(`  t${f.g.temporada} c${f.g.competicion} g${f.g.grupo} · ${f.motivo.slice(0, 200)}`);
  process.exitCode = 1;
}
