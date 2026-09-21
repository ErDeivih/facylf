#!/usr/bin/env node
/**
 * SÓLO LECTURA: compara, fila a fila y EN ORDEN, lo que dice la cola y lo que dice el HTML.
 *
 * Es lo que revela un desplazamiento: si la cola asigna a una fila el acta, el marcador o el campo de
 * otra, los dos listados dejan de cuadrar posición a posición y se ve exactamente en qué punto.
 *
 * Uso: npx tsx scripts/_diag-cola-vs-html-jornada.mjs --federacion aragon --grupo 4806661 --jornada 1
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { parse } from 'node-html-parser';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const federacion = arg('federacion');
const grupo = arg('grupo');
const jornada = Number(arg('jornada', 1));

const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });
const j = db.prepare('select temporada, competicion, grupo, numero, archivo from jornadas where grupo=? and numero=? limit 1').get(grupo, jornada);
const filas = db.prepare(`select orden, codigo_acta, equipo_local_codigo cl, equipo_visitante_codigo cv, local, visitante,
    goles_local gl, goles_visitante gv, fecha, hora, campo, campo_codigo, arbitro from partidos
  where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
  .all(j.temporada, j.competicion, j.grupo, jornada);
db.close();

const ruta = [j.archivo, `${j.archivo}.gz`].find((r) => existsSync(r));
const html = /\.gz$/i.test(ruta) ? gunzipSync(readFileSync(ruta)).toString('utf8') : readFileSync(ruta, 'utf8');
const { extraePartidos } = await import('./lib/recolector-local.mjs');
const extraidas = extraePartidos(html);

// Los enlaces de acta en orden de documento, que es la lista con la que se puede desalinear.
const raizHtml = parse(html);
const actasDocumento = raizHtml.querySelectorAll('a[href*="NFG_CmpPartido"]').map((a) => {
  const href = a.getAttribute('href') ?? '';
  const m = /[?&](?:CodActa|cod_acta)=(\d+)/i.exec(href);
  return { codActa: m?.[1] ?? null, texto: (a.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), enTablaCon: a.closest('table')?.querySelectorAll('a[href*="NFG_VisEquipos"]').length ?? 0 };
});

console.log(`jornada ${ruta}`);
console.log(`\n=== LA COLA (${filas.length} filas, en orden) ===`);
for (const f of filas) {
  console.log(`  ord ${String(f.orden).padStart(2)} · acta ${(f.codigo_acta ?? 'NULL').padEnd(9)} · ${f.gl ?? 'NULL'}-${f.gv ?? 'NULL'}`
    + ` · ${f.fecha ?? 'sin fecha'} ${f.hora ?? ''} · campo ${JSON.stringify(f.campo ?? null)}`);
  console.log(`         «${f.local}» vs «${f.visitante}» · códigos ${f.cl ?? '-'}/${f.cv ?? '-'} · árbitro ${JSON.stringify(f.arbitro ?? null)}`);
}
console.log(`\n=== EL EXTRACTOR (extraePartidos, ${extraidas.length} filas, EN ORDEN) ===`);
for (const [i, p] of extraidas.entries()) {
  console.log(`  [${String(i).padStart(2)}] acta ${(p.codActa ?? 'NULL').padEnd(9)} · códigos ${p.codLocal ?? '-'}/${p.codVisitante ?? '-'} · «${p.local}» vs «${p.visitante}»`);
}
console.log(`\n=== ENLACES DE ACTA EN EL DOCUMENTO (en orden) ===`);
for (const [i, a] of actasDocumento.entries()) {
  console.log(`  [${String(i).padStart(2)}] acta ${(a.codActa ?? 'NULL').padEnd(9)} · en tabla con ${a.enTablaCon} enlaces de equipo · texto ${JSON.stringify(a.texto)}`);
}
console.log('\n=== ¿CUADRAN LAS DOS LISTAS POR POSICIÓN? ===');
const n = Math.max(extraidas.length, filas.length);
for (let i = 0; i < n; i += 1) {
  const q = filas[i];
  const e = extraidas[i];
  const parejaCola = q ? `${q.local} vs ${q.visitante}` : '(no hay)';
  const parejaHtml = e ? `${e.local} vs ${e.visitante}` : '(no hay)';
  const igual = q && e && q.local === e.local && q.visitante === e.visitante;
  const actaCoincide = q && e && (q.codigo_acta ?? null) === (e.codActa ?? null);
  console.log(`  [${i}] ${igual ? 'pareja OK ' : 'PAREJA ≠ '}${actaCoincide ? 'acta OK' : 'ACTA ≠'}`);
  if (!igual) console.log(`        cola: ${parejaCola}\n        html: ${parejaHtml}`);
}
