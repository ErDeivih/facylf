#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿qué es `(P)`? Evidencia en el HTML archivado, sin intuición.
 *
 * El encargo lo deja explícito: `(P)` NO se resuelve por intuición, y los casos que dependen de él siguen
 * ambiguos «hasta encontrar evidencia independiente». Esto busca esa evidencia donde puede estar:
 *
 * 1. ¿está `(P)` en el HTML archivado, o sólo en la fila de la cola? Si no está en el HTML, la cola lo
 *    arrastra de una versión anterior del extractor y el marcador no lo publica la fuente;
 * 2. ¿en qué MARCADO vive? Un `<span class="…">`, un `title="…"` o un comentario pueden decir qué es sin
 *    que haya que adivinarlo;
 * 3. ¿con qué otros marcadores aparece y en qué orden? Si `(P)` acompaña siempre a `(Sailkatua)` o
 *    `(Irabazlea)`, es un estado de la competición y no parte del nombre;
 * 4. ¿en qué jornadas y competiciones aparece? Un marcador que sólo sale en futsal, o sólo en las últimas
 *    jornadas, acota su significado.
 *
 * Uso: npx tsx scripts/_diag-que-es-p.mjs [--federacion euskadi] [--raiz <raiz de datos>] [--muestras 6]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const muestras = Number(arg('muestras', 6));

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

/* 1 y 3: dónde vive `(P)` y con qué acompaña. */
const filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, local, visitante
  from partidos where local like '%(P)%' or visitante like '%(P)%' order by temporada, competicion, grupo, jornada, orden`).all();
console.log(`filas de la cola con «(P)»: ${filas.length}`);

const acompanantes = new Map();
const porTemporada = new Map();
const gruposConP = new Set();
for (const f of filas) {
  for (const literal of [f.local, f.visitante]) {
    if (!/\(P\)/i.test(literal)) continue;
    // Qué otros paréntesis acompañan a `(P)` y en qué orden.
    const otros = [...literal.matchAll(/\(([^()]{1,20})\)/g)].map((m) => m[1]).filter((t) => !/^p$/i.test(t));
    const firma = otros.length ? otros.join('+') : '(solo)';
    acompanantes.set(firma, (acompanantes.get(firma) ?? 0) + 1);
    // Posición de `(P)` respecto al nombre.
    const posicion = /^\s*\(P\)/i.test(literal) ? 'al principio' : (/\(P\)\s*$/i.test(literal) ? 'al final' : 'en medio');
    acompanantes.set(`posición: ${posicion}`, (acompanantes.get(`posición: ${posicion}`) ?? 0) + 1);
  }
  porTemporada.set(f.temporada, (porTemporada.get(f.temporada) ?? 0) + 1);
  gruposConP.add(`${f.temporada}|${f.competicion}|${f.grupo}`);
}
console.log(`  grupos afectados: ${gruposConP.size}`);
console.log(`  por temporada: ${[...porTemporada.entries()].sort().map(([t, n]) => `t${t}:${n}`).join(' ')}`);
console.log('  con qué otros marcadores aparece:');
for (const [firma, n] of [...acompanantes.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${firma.padEnd(28)} ${n}`);

/* 2: ¿está en el HTML archivado, y en qué marcado? */
console.log('\n¿está «(P)» en el HTML archivado de su propia jornada?');
let enHtml = 0;
let noEnHtml = 0;
const marcados = [];
for (const f of filas) {
  const j = db.prepare(`select archivo from jornadas where temporada=? and competicion=? and grupo=? and numero=?`)
    .get(f.temporada, f.competicion, f.grupo, f.jornada);
  const html = j?.archivo ? leer(j.archivo) : null;
  if (html === null) continue;
  const literal = /\(P\)/i.test(f.local) ? f.local : f.visitante;
  const base = literal.replace(/\s*\(P\)\s*/i, ' ').replace(/\s+/g, ' ').trim();
  // ¿Aparece el nombre limpio seguido de `(P)` en el HTML?
  const escapado = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/"/g, '"?');
  const re = new RegExp(escapado.replace(/\s+/g, '\\s*') + '[^<]{0,60}', 'i');
  const m = re.exec(html.replace(/&nbsp;/g, ' '));
  if (m) {
    enHtml += 1;
    if (/\(P\)/i.test(m[0])) marcados.push({ f, literal, fragmento: m[0].slice(0, 200) });
  } else {
    noEnHtml += 1;
  }
}
console.log(`  filas cuyo nombre aparece en el HTML: ${enHtml} · cuyo nombre no se localizó: ${noEnHtml}`);
console.log(`  de las encontradas, con «(P)» pegado en el HTML: ${marcados.length}`);
console.log(`\n  primeras ${Math.min(muestras, marcados.length)} muestras del MARCADO tal cual lo publica la fuente:`);
for (const m of marcados.slice(0, muestras)) {
  console.log(`    t${m.f.temporada} c${m.f.competicion} g${m.f.grupo} J${m.f.jornada} acta ${m.f.codigo_acta}`);
  console.log(`      cola: «${m.literal}»`);
  console.log(`      html: ${JSON.stringify(m.fragmento)}`);
}
/* 4: ¿en qué competiciones aparece? Acota el significado. */
console.log('\ncompeticiones donde aparece «(P)»:');
for (const r of db.prepare(`select competicion, count(*) n from partidos
  where local like '%(P)%' or visitante like '%(P)%' group by 1 order by 2 desc limit 12`).all()) {
  const nombre = db.prepare('select nombre from competiciones where codigo = ? limit 1').get(r.competicion)?.nombre ?? '(sin nombre)';
  console.log(`  c${r.competicion} · ${r.n} filas · ${nombre}`);
}
db.close();
