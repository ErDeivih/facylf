#!/usr/bin/env node
/** Diagnóstico de SÓLO LECTURA: volcado literal de una jornada, cola y páginas archivadas. */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { extraePartidos } from './lib/recolector-local.mjs';

const [temporada = '20', etiqueta = '2024-25', competicion = '11379751', grupo = '11379752', jornada = '8'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-federacion', 'recolector-local', `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

console.log(`=== cola · J${jornada} ===`);
for (const f of db.prepare(`select orden, codigo_acta, equipo_local_codigo, equipo_visitante_codigo, local, visitante,
    goles_local, goles_visitante, fecha, hora, campo, arbitro
  from partidos where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
  .all(temporada, competicion, grupo, Number(jornada))) {
  console.log(`  ${f.orden}: ${f.local} (${f.equipo_local_codigo}) ${f.goles_local ?? '-'}-${f.goles_visitante ?? '-'} ${f.visitante} (${f.equipo_visitante_codigo}) · acta ${f.codigo_acta ?? '—'}`);
}

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

for (const nombre of [`jornadas/jornada-${jornada}.html.gz`, 'calendario.html.gz']) {
  const html = leer(join(base, nombre));
  console.log(`\n=== extraePartidos · ${nombre} === ${html ? `${html.length} caracteres` : 'NO EXISTE'}`);
  if (!html) continue;
  for (const [i, p] of extraePartidos(html).entries()) {
    console.log(`  ${i}: ${p.local} (${p.codLocal}) - ${p.visitante} (${p.codVisitante}) · acta ${p.codActa}`);
  }
}

db.close();
