#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿publican identificadores de equipo la CLASIFICACIÓN y el CALENDARIO de Euskadi?
 *
 * La jerarquía del encargo admite recuperar el código del mismo equipo «en otra representación del
 * mismo grupo y temporada». Estas son las otras representaciones archivadas del grupo: la clasificación
 * y el calendario. Si tampoco traen identificadores, la conclusión es que la fuente NO publica código
 * para esos grupos y la inscripción sólo puede enlazarse por referencia contextual.
 *
 * Uso: npx tsx scripts/_diag-nova-otras-representaciones.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { parse } from 'node-html-parser';

const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

/** Un grupo donde NINGÚN partido trae código: es donde la pregunta importa. */
const grupo = db.prepare(`select temporada, competicion, grupo, count(*) n from partidos
  where equipo_local_codigo is null group by 1,2,3 order by n desc limit 1`).get();
console.log(`grupo sin ningún código en el calendario: t${grupo.temporada} c${grupo.competicion} g${grupo.grupo} (${grupo.n} partidos)`);

const carpeta = join(base, `t${grupo.temporada}-`, '');
/* La carpeta real se localiza por el nombre del grupo. */
const { readdirSync } = await import('node:fs');
let dirGrupo = null;
for (const t of readdirSync(base)) {
  if (!t.startsWith(`t${grupo.temporada}-`)) continue;
  const p = join(base, t, `comp-${grupo.competicion}`, `grupo-${grupo.grupo}`);
  if (existsSync(p)) { dirGrupo = p; break; }
}
console.log(`carpeta: ${dirGrupo}`);
if (!dirGrupo) { db.close(); process.exit(0); }

const ficheros = readdirSync(dirGrupo).filter((f) => /clasificacion|calendario/.test(f));
console.log(`ficheros de otras representaciones: ${ficheros.join(', ') || '(ninguno)'}`);

const patrones = [
  ['equipo1=', /equipo1=/gi], ['equipo2=', /equipo2=/gi], ['Codigo_Equipo=', /Codigo_Equipo=/gi],
  ['codequipo=', /codequipo=/gi], ['codEquipo', /codEquipo/gi], ['NFG_VisEquipos', /NFG_VisEquipos/gi],
  ['CodActa=', /CodActa=/gi], ['id="equipo', /id="equipo/gi], ['data-', /data-[a-z-]+=/gi],
  ['escudos/', /escudos[A-Za-z]*\//gi], ['Clubes/', /Clubes\//gi],
];
for (const f of ficheros) {
  const html = leer(join(dirGrupo, f));
  if (!html) { console.log(`\n--- ${f}: no legible`); continue; }
  console.log(`\n--- ${f} · ${html.length} caracteres ---`);
  const encontrados = [];
  for (const [nombre, re] of patrones) {
    const n = (html.match(re) ?? []).length;
    if (n) encontrados.push(`${nombre}=${n}`);
  }
  console.log(`  ${encontrados.join(' · ') || '(ningún patrón de identificador)'}`);

  // Enlaces reales que aparezcan, para ver qué ofrece la página.
  const raizHtml = parse(html);
  const enlaces = [...new Set(raizHtml.querySelectorAll('a[href]').map((a) => a.getAttribute('href') ?? ''))]
    .filter((h) => /Equipo|equipo|Clasif|Jornada|Partido/i.test(h));
  console.log(`  enlaces con pinta de identificar algo: ${enlaces.length}`);
  for (const e of enlaces.slice(0, 6)) console.log(`      ${e.slice(0, 140)}`);
  // Nombres de equipo que aparecen, y su fila cruda si la hay.
  const filasTabla = raizHtml.querySelectorAll('tr').filter((tr) => tr.querySelectorAll('td').length >= 5);
  console.log(`  filas de tabla con 5+ celdas: ${filasTabla.length}`);
  if (filasTabla[0]) console.log(`  primera fila: ${filasTabla[0].outerHTML.replace(/\s+/g, ' ').slice(0, 700)}`);
}
db.close();
