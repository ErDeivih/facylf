#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿quién deja de jugar contra quién?
 *
 * En una liga regular de 19 equipos cada equipo juega 36 partidos: dos contra cada uno de los otros
 * 18. Si a un equipo le falta un partido y a otro le sobra, el emparejamiento está mal. Este script
 * busca los pares que aparecen 1 o 3 veces (deberían ser 2) y los enfrentamientos que faltan.
 *
 * Uso: node scripts/_diag-pares-cl.mjs [temporada] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';

const [temporada = '20', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const ruta = resolve(import.meta.dirname, '..', 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite');
const db = new DatabaseSync(ruta, { readOnly: true });

const filas = db.prepare(`select jornada, orden, codigo_acta, local, visitante, goles_local, goles_visitante
  from partidos where temporada = ? and competicion = ? and grupo = ? order by jornada, orden`)
  .all(temporada, competicion, grupo);

const equipos = [...new Set(filas.flatMap((f) => [f.local, f.visitante]))].sort((a, b) => a.localeCompare(b, 'es'));
console.log(`equipos: ${equipos.length} · partidos: ${filas.length} · esperados: ${equipos.length * (equipos.length - 1)}`);

/* Enfrentamientos (par sin orden) y su reparto local/visitante. */
const par = new Map();
for (const f of filas) {
  const clave = [f.local, f.visitante].sort((a, b) => a.localeCompare(b, 'es')).join(' || ');
  if (!par.has(clave)) par.set(clave, []);
  par.get(clave).push(f);
}
const irregulares = [...par.entries()].filter(([, v]) => v.length !== 2).sort((a, b) => b[1].length - a[1].length);
console.log(`\npares distintos: ${par.size} (esperados ${(equipos.length * (equipos.length - 1)) / 2}) · con recuento ≠ 2: ${irregulares.length}`);
for (const [clave, v] of irregulares) {
  console.log(`\n  ${clave} → ${v.length} veces`);
  for (const f of v) console.log(`      J${String(f.jornada).padStart(2)} ord ${f.orden} · ${f.local} ${f.goles_local ?? '-'}-${f.goles_visitante ?? '-'} ${f.visitante} · acta ${f.codigo_acta ?? '—'}`);
}

/* Rivales repetidos y rivales ausentes por equipo. */
console.log('\nrivales por equipo (deben ser 18 distintos, 2 partidos cada uno):');
for (const eq of equipos) {
  const rivales = new Map();
  for (const f of filas) {
    if (f.local === eq) rivales.set(f.visitante, (rivales.get(f.visitante) ?? 0) + 1);
    else if (f.visitante === eq) rivales.set(f.local, (rivales.get(f.local) ?? 0) + 1);
  }
  const repetidos = [...rivales.entries()].filter(([, n]) => n !== 2);
  const ausentes = equipos.filter((o) => o !== eq && !rivales.has(o));
  if (repetidos.length || ausentes.length) {
    console.log(`  ${eq}: ${rivales.size} rivales`);
    if (repetidos.length) console.log(`      recuento ≠ 2: ${repetidos.map(([r, n]) => `${r} (${n})`).join(', ')}`);
    if (ausentes.length) console.log(`      NUNCA se enfrenta a: ${ausentes.join(', ')}`);
  }
}

/* Casilla local/visitante: cada pareja debe jugar una vez en cada campo. */
console.log('\npares con el campo repetido (dos veces local el mismo):');
for (const [clave, v] of par) {
  if (v.length !== 2) continue;
  if (v[0].local === v[1].local) console.log(`  ${clave}: ${v.map((f) => `J${f.jornada} ${f.local}-${f.visitante}`).join(' · ')}`);
}

db.close();
