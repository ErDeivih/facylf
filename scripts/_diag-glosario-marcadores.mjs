#!/usr/bin/env node
/**
 * SÓLO LECTURA: el GLOSARIO DE LA PROPIA FUENTE para los marcadores de estado.
 *
 * La maqueta nova no publica `(P)` a secas: publica
 *
 *     <span title="Ganador del partido en Penaltis" …> (P) </span>
 *
 * Es decir, **la fuente dice qué significa cada paréntesis** en el atributo `title`. Eso convierte la
 * lista de marcadores en algo que se puede COMPROBAR en vez de adivinar, y responde de una vez por todas a
 * la pregunta que el encargo deja abierta: qué es `(P)`, `(RET)`, `(Juv.)`, `(Femenino)` y `(VETERANOS)`.
 *
 * Lo que hace: recorre las celdas de nombre de las jornadas archivadas, saca cada `(token)` con el `title`
 * de su `<span>` y agrega token → títulos. No interpreta nada.
 *
 * Uso: npx tsx scripts/_diag-glosario-marcadores.mjs [--federacion euskadi] [--max-jornadas 400]
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const federacion = arg('federacion', 'euskadi');
const maxJornadas = Number(arg('max-jornadas', 400));
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (!existsSync(r)) continue;
    return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

/** Sólo las jornadas de grupos que citan algún paréntesis: no hace falta leer las 4.800. */
const jornadas = db.prepare(`select distinct j.temporada, j.competicion, j.grupo, j.numero, j.archivo
  from jornadas j
  where j.archivo is not null
    and exists (select 1 from partidos p where p.temporada = j.temporada and p.competicion = j.competicion
                  and p.grupo = j.grupo and (p.local like '%(%' or p.visitante like '%(%'))
  order by j.temporada, j.competicion, j.grupo, j.numero limit ?`).all(maxJornadas);
console.log(`jornadas a leer: ${jornadas.length} (de grupos que citan paréntesis)`);

/** token → Map(título → veces). El título vacío cuenta como «sin title». */
const glosario = new Map();
const ejemplos = new Map();
let celdasLeidas = 0;
let jornadasLeidas = 0;
let jornadasSinArchivo = 0;

for (const j of jornadas) {
  const html = leer(j.archivo);
  if (html === null) { jornadasSinArchivo += 1; continue; }
  jornadasLeidas += 1;
  // La celda del nombre: <div class="font_widgetL|V"> … <h4> … </h4>. Se toma el contenido del <h4>.
  for (const m of html.matchAll(/<div class="font_widget[LV]">[\s\S]{0,400}?<h4>([\s\S]*?)<\/h4>/gi)) {
    celdasLeidas += 1;
    const celda = m[1];
    // Cada `<span …>texto</span>` con su title, y también el texto suelto.
    for (const s of celda.matchAll(/<span([^>]*)>([\s\S]*?)<\/span>/gi)) {
      const atributos = s[1];
      const texto = s[2].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!/^\(.+\)$/.test(texto)) continue;
      const title = /title="([^"]*)"/i.exec(atributos)?.[1]?.trim() ?? '(sin title)';
      if (!glosario.has(texto)) glosario.set(texto, new Map());
      const t = glosario.get(texto);
      t.set(title, (t.get(title) ?? 0) + 1);
      if (!ejemplos.has(texto)) ejemplos.set(texto, { jornada: `t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}`, atributos: atributos.trim().slice(0, 180) });
    }
    // Paréntesis que van en el texto suelto, sin span: no llevan título.
    for (const m2 of celda.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').matchAll(/\(([^()]{1,20})\)/g)) {
      const texto = `(${m2[1]})`;
      if (!glosario.has(texto)) glosario.set(texto, new Map());
      const t = glosario.get(texto);
      t.set('(texto suelto, sin span)', (t.get('(texto suelto, sin span)') ?? 0) + 1);
    }
  }
}
db.close();

console.log(`jornadas leídas: ${jornadasLeidas} · sin archivo legible: ${jornadasSinArchivo} · celdas de nombre: ${celdasLeidas}`);
console.log('\n=== GLOSARIO DE LA FUENTE: qué dice el `title` de cada paréntesis ===');
const orden = [...glosario.entries()].sort((a, b) => {
  const suma = (m) => [...m.values()].reduce((x, y) => x + y, 0);
  return suma(b[1]) - suma(a[1]);
});
for (const [token, titulos] of orden) {
  const total = [...titulos.values()].reduce((a, b) => a + b, 0);
  console.log(`\n  ${token}  (${total} apariciones)`);
  for (const [titulo, n] of [...titulos.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(5)}  title="${titulo}"`);
  }
  const e = ejemplos.get(token);
  if (e) console.log(`      ejemplo: ${e.jornada} · <span${e.atributos}>`);
}
