#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿qué grupos de Euskadi son de verdad importables?
 *
 * Un grupo sólo se puede importar si **ningún** acta suya detiene el lote. El importador detiene el lote
 * cuando el calendario y el acta no comparten equipo y la contradicción no es demostrable
 * (`forma = 'otro'`), y la comparación se hace con el nombre LIMPIO de los dos lados: un marcador de
 * estado no cuenta, pero `(P)` sí, porque no está demostrado qué es.
 *
 * Esto NO lo mide el manifiesto de la reconstrucción: allí sólo se marca «ambigua» la fila que CAMBIA al
 * releer su HTML y el acta no sostiene. Una fila que no cambia puede seguir deteniendo su importación, y
 * eso es justo lo que hay que contar antes de decir que Euskadi es importable.
 *
 * Uso: npx tsx scripts/_diag-importables-euskadi.mjs [--federacion euskadi] [--raiz <raiz de datos>]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true });

const limpio = (t) => normalizaNombreEquipo(separaNombreYEstado(String(t ?? '')).nombreEquipo);
const pareja = (a, b) => [a, b].sort().join(' || ');

/** grupo → { partidos, actas, bloqueos: [{jornada, orden, calendario, acta}] } */
const grupos = new Map();
const claves = new Set();
for (const p of db.prepare('select temporada, competicion, grupo from partidos').all()) {
  const k = `${p.temporada}|${p.competicion}|${p.grupo}`;
  if (grupos.has(k)) continue;
  grupos.set(k, { partidos: 0, actas: 0, bloqueos: [] });
}
for (const p of db.prepare('select temporada, competicion, grupo, count(*) n from partidos group by 1,2,3').all()) {
  grupos.get(`${p.temporada}|${p.competicion}|${p.grupo}`).partidos = p.n;
}
for (const a of db.prepare('select temporada, competicion, grupo, count(*) n from actas group by 1,2,3').all()) {
  const g = grupos.get(`${a.temporada}|${a.competicion}|${a.grupo}`);
  if (g) g.actas = a.n;
}

const consulta = db.prepare(`select p.temporada t, p.competicion c, p.grupo g, p.jornada j, p.orden o,
    p.local pl, p.visitante pv, a.codigo acta, a.datos d
  from partidos p join actas a on a.temporada = p.temporada and a.competicion = p.competicion
    and a.grupo = p.grupo and a.codigo = p.codigo_acta
 where a.datos is not null`);
for (const f of consulta.iterate()) {
  let d; try { d = JSON.parse(f.d); } catch { continue; }
  if (!d?.local || !d?.visitante) continue;
  claves.add(`${f.t}|${f.c}|${f.g}`);
  if (pareja(limpio(f.pl), limpio(f.pv)) === pareja(limpio(d.local), limpio(d.visitante))) continue;
  // El importador no comparte la pareja y no es demostrable: este grupo se detiene.
  grupos.get(`${f.t}|${f.c}|${f.g}`).bloqueos.push({
    jornada: f.j, orden: f.o, acta: f.acta,
    calendario: `${f.pl} vs ${f.pv}`, acta: `${d.local} vs ${d.visitante}`,
  });
}
db.close();

const valores = [...grupos.entries()].map(([k, v]) => ({ clave: k, ...v }));
const total = valores.length;
const conBloqueo = valores.filter((v) => v.bloqueos.length > 0);
const sinBloqueo = valores.filter((v) => v.bloqueos.length === 0);
const conActas = valores.filter((v) => v.actas > 0);

console.log(`grupos de ${federacion} con partidos: ${total}`);
console.log(`  con alguna acta leída: ${conActas.length}`);
console.log(`  SIN ningún bloqueo de importación: ${sinBloqueo.length}`);
console.log(`  CON algún bloqueo (su lote se detiene): ${conBloqueo.length}`);
console.log(`  filas que bloquean (en total): ${conBloqueo.reduce((a, v) => a + v.bloqueos.length, 0)}`);

const grandes = sinBloqueo.filter((v) => v.actas > 0).sort((a, b) => b.partidos - a.partidos);
console.log(`\ngrupos importables con actas, por tamaño:`);
for (const v of grandes.slice(0, 15)) {
  const [t, c, g] = v.clave.split('|');
  console.log(`  t${t} c${c} g${g} · ${v.partidos} partidos · ${v.actas} actas`);
}
if (grandes.length === 0) console.log('  (ninguno)');
console.log(`\nprimeros bloqueos reales (lo que detendría el lote):`);
for (const v of conBloqueo.slice(0, 6)) {
  const [t, c, g] = v.clave.split('|');
  const b = v.bloqueos[0];
  console.log(`  t${t} c${c} g${g} J${b.jornada} ord ${b.orden} acta ${b.acta}`);
  console.log(`      calendario: ${b.calendario}`);
  console.log(`      acta:       ${b.acta}`);
}
