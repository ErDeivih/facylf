#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿por qué la detección del bloque de descanso no cubre todas las filas?
 *
 * La reconstrucción alinea la cola con el HTML **por posición**. Si la cuenta no cuadra
 * (`filas de la cola ≠ partidos del HTML + bloques informativos del HTML`), la alineación se desplaza y las
 * filas siguientes de esa jornada dejan de cuadrar: eso es lo que producía 55 «ambiguas» de más en Euskadi.
 *
 * Esto mide, jornada a jornada, dónde no cuadra la cuenta y enseña las filas de la cola que no tienen
 * correspondencia, para poder ver si son descansos que no se detectaron o partidos de verdad.
 *
 * Uso: npx tsx scripts/_diag-cuadre-descanso.mjs --federacion euskadi [--raiz <raiz de datos>] [--max 12]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { extraePartidos, extraeFilasInformativas } from './lib/recolector-local.mjs';
import { normalizaNombreEquipo, separaNombreYEstado } from '../packages/ingesta/src/parsers/nova-equipos.js';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const max = Number(arg('max', 12));

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`]) {
    if (!existsSync(r)) continue;
    return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};
const norm = (t) => normalizaNombreEquipo(separaNombreYEstado(String(t ?? '')).nombreEquipo);
const parejaDe = (a, b) => [norm(a), norm(b)].sort().join(' || ');

const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
/** Sólo las jornadas que tienen alguna fila con palabra de descanso en la cola. */
const jornadas = db.prepare(`select distinct j.temporada, j.competicion, j.grupo, j.numero, j.archivo
  from jornadas j
  where j.archivo is not null
    and exists (select 1 from partidos p where p.temporada=j.temporada and p.competicion=j.competicion
                  and p.grupo=j.grupo and p.jornada=j.numero
                  and (lower(p.local) like '%descans%' or lower(p.visitante) like '%descans%'
                    or lower(p.local) like '%atsedena%' or lower(p.visitante) like '%atsedena%'))
  order by j.temporada, j.competicion, j.grupo, j.numero`).all();

let cuadran = 0;
let noCuadran = 0;
const ejemplos = [];
for (const j of jornadas) {
  const html = leer(j.archivo);
  if (html === null) continue;
  const filas = db.prepare(`select orden, codigo_acta, local, visitante from partidos
    where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
    .all(j.temporada, j.competicion, j.grupo, j.numero);
  const extraidos = extraePartidos(html);
  const informativas = extraeFilasInformativas(html);
  // Cuántas filas de la cola se explican como partido o como bloque informativo.
  const parejasHtml = new Set([...extraidos.map((p) => parejaDe(p.local, p.visitante)),
    ...informativas.map((i) => parejaDe(i.local, i.visitante))]);
  const sinCorrespondencia = filas.filter((f) => !parejasHtml.has(parejaDe(f.local, f.visitante)));
  const cuadra = filas.length === extraidos.length + informativas.length && sinCorrespondencia.length === 0;
  if (cuadra) { cuadran += 1; continue; }
  noCuadran += 1;
  if (ejemplos.length < max) {
    ejemplos.push({
      j, filas: filas.length, extraidos: extraidos.length, informativas: informativas.length, sinCorrespondencia,
      informativasLista: informativas,
    });
  }
}
db.close();

console.log(`jornadas con palabra de descanso en la cola: ${jornadas.length}`);
console.log(`  cuadran (colar = partidos HTML + informativas HTML): ${cuadran}`);
console.log(`  NO cuadran: ${noCuadran}`);
for (const e of ejemplos) {
  console.log(`\n  t${e.j.temporada} c${e.j.competicion} g${e.j.grupo} J${e.j.numero}`);
  console.log(`    cola ${e.filas} filas · HTML ${e.extraidos} partidos + ${e.informativas} informativas = ${e.extraidos + e.informativas}`);
  console.log(`    filas de la cola sin correspondencia en el HTML: ${e.sinCorrespondencia.length}`);
  for (const f of e.sinCorrespondencia.slice(0, 4)) {
    console.log(`      ord ${f.orden} · acta ${f.codigo_acta ?? 'NULL'} · «${f.local}» vs «${f.visitante}»`);
  }
  for (const i of e.informativasLista.slice(0, 3)) {
    console.log(`    informativa detectada: «${i.local}» vs «${i.visitante}» · ${i.motivo}`);
  }
}
