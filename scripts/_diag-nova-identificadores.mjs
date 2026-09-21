#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿dónde aparecen identificadores de equipo en la maqueta «nova» de Euskadi?
 *
 * Se recorren jornadas archivadas reales y se cuentan TODAS las formas en que la página puede
 * identificar un equipo: enlaces, atributos, formularios, parámetros de acta y scripts o JSON
 * embebidos. No se deduce ningún código a partir del nombre: se busca la relación que la fuente
 * publica de verdad.
 *
 * Uso: node scripts/_diag-nova-identificadores.mjs [nJornadas]
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';

const nJornadas = Number(process.argv[2] ?? 40);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-euskadi', 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

/* Muestra estratificada: jornadas con 2 códigos, con 1 y con 0, de temporadas distintas. */
const porEstado = { dos: [], uno: [], cero: [] };
for (const f of db.prepare(`select j.temporada, j.competicion, j.grupo, j.numero, j.archivo, count(*) n,
    sum(case when p.equipo_local_codigo is not null and p.equipo_visitante_codigo is not null then 1 else 0 end) ambos,
    sum(case when (p.equipo_local_codigo is null) <> (p.equipo_visitante_codigo is null) then 1 else 0 end) uno,
    sum(case when p.equipo_local_codigo is null and p.equipo_visitante_codigo is null then 1 else 0 end) ninguno
  from jornadas j join partidos p on p.temporada=j.temporada and p.competicion=j.competicion and p.grupo=j.grupo and p.jornada=j.numero
  where j.archivo is not null group by 1,2,3,4,5`).all()) {
  const estado = f.ninguno > 0 && f.ambos === 0 ? 'cero' : (f.uno > 0 ? 'uno' : (f.ambos > 0 ? 'dos' : null));
  if (estado) porEstado[estado].push(f);
}
console.log(`jornadas con archivo: ${Object.values(porEstado).reduce((a, b) => a + b.length, 0)}`);
for (const [k, v] of Object.entries(porEstado)) {
  const temporadas = [...new Set(v.map((x) => x.temporada))].sort();
  console.log(`  con códigos «${k}»: ${v.length} · temporadas ${temporadas.join(', ')}`);
}

const patrones = [
  ['NFG_VisEquipos', /NFG_VisEquipos/g],
  ['Codigo_Equipo=', /Codigo_Equipo=/gi],
  ['codequipo=', /codequipo=/gi],
  ['equipo1=', /equipo1=/gi],
  ['equipo2=', /equipo2=/gi],
  ['NFG_CmpPartido', /NFG_CmpPartido/gi],
  ['CodActa=', /CodActa=/gi],
  ['cod_acta=', /cod_acta=/gi],
  ['NFG_VisCampos', /NFG_VisCampos/gi],
  ['font_widgetL', /font_widgetL/g],
  ['font_widgetV', /font_widgetV/g],
  ['wid2_resultado', /wid2_resultado/g],
  ['data-codigo', /data-codigo/gi],
  ['codEquipo', /codEquipo/gi],
  ['c_equipo', /c_equipo/gi],
  ['EquipoCodigo', /EquipoCodigo/gi],
  ['id="equipo', /id="equipo/gi],
  ['name="equipo', /name="equipo/gi],
];

const muestra = [
  ...porEstado.dos.slice(0, Math.ceil(nJornadas / 3)),
  ...porEstado.uno.slice(0, Math.ceil(nJornadas / 3)),
  ...porEstado.cero.slice(0, Math.ceil(nJornadas / 3)),
];
console.log(`\nanalizando ${muestra.length} jornadas…\n`);
const totales = new Map();
let analizadas = 0;
const primerasFilas = [];
for (const j of muestra) {
  // `jornadas.archivo` guarda la ruta ABSOLUTA del HTML archivado (a veces con `.gz`).
  const ruta = j.archivo;
  const candidatas = [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')];
  const existente = candidatas.find((r) => existsSync(r));
  if (!existente) continue;
  const html = /\.gz$/i.test(existente) ? gunzipSync(readFileSync(existente)).toString('utf8') : readFileSync(existente, 'utf8');
  analizadas++;
  for (const [nombre, re] of patrones) {
    const n = (html.match(re) ?? []).length;
    if (n) totales.set(nombre, (totales.get(nombre) ?? 0) + n);
  }
  // La fila de un partido, en crudo, para ver dónde está (o no está) el identificador.
  if (primerasFilas.length < 2 && j.ninguno > 0) {
    const i = html.indexOf('font_widgetL');
    if (i > 0) primerasFilas.push({ etiqueta: `t${j.temporada} c${j.competicion} g${j.grupo} J${j.numero}`, fragmento: html.slice(Math.max(0, i - 2500), i + 3000) });
  }
}
console.log(`jornadas analizadas: ${analizadas}`);
console.log(`\n--- ocurrencias por patrón ---`);
for (const [k, n] of [...totales.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(20)} ${n}`);

for (const f of primerasFilas) {
  console.log(`\n=== fila cruda · ${f.etiqueta} ===`);
  console.log(f.fragmento.replace(/\s+/g, ' '));
}
db.close();
