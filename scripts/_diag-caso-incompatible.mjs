#!/usr/bin/env node
/**
 * SÓLO LECTURA: anatomía de UN caso incompatible, con la evidencia archivada delante.
 *
 * Para el caso pedido enseña, en este orden:
 *   1. la fila del calendario en la cola (con sus códigos);
 *   2. lo que dice el HTML de la jornada archivado, releído con el extractor del recolector —incluido
 *      el `CodActa` de cada fila, que es lo que enlaza partido y acta—;
 *   3. lo que dice la cabecera del ACTA archivada (sus dos equipos y su marcador).
 *
 * Con eso se distingue «el enlace del calendario apunta a otra acta» de «la acta es de otro partido»,
 * que son dos causas distintas y se corrigen en sitios distintos.
 *
 * Uso: node scripts/_diag-caso-incompatible.mjs <federacion> <temporadaInterna> <etiqueta> <competicion> <grupo> <jornada> <orden>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { extraePartidos, extraePartidosWidget } from './lib/recolector-local.mjs';

const [federacion, temporada, etiqueta, competicion, grupo, jornada, orden] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const carpetaFederacion = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const base = join(raiz, carpetaFederacion, 'recolector-local');
const db = new DatabaseSync(join(base, 'cola-v2.sqlite'), { readOnly: true });

const leer = (ruta) => {
  for (const r of [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')]) {
    if (existsSync(r)) return /\.gz$/i.test(r) ? gunzipSync(readFileSync(r)).toString('utf8') : readFileSync(r, 'utf8');
  }
  return null;
};

const fila = db.prepare(`select jornada, orden, codigo_acta, equipo_local_codigo, equipo_visitante_codigo,
    local, visitante, goles_local, goles_visitante, fecha, hora, campo
  from partidos where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
  .get(temporada, competicion, grupo, Number(jornada), Number(orden));
console.log(`=== 1. La fila de la cola ===`);
console.log(JSON.stringify(fila, null, 2));

const acta = fila?.codigo_acta
  ? db.prepare('select codigo, jornada, estado, calidad, archivo, hash, comprobada_en from actas where codigo=? and temporada=? and competicion=? and grupo=?')
    .get(fila.codigo_acta, temporada, competicion, grupo)
  : null;
console.log(`\n=== 2. La fila del acta en la cola ===`);
console.log(JSON.stringify(acta, null, 2));

/* 2. El HTML de la jornada, releído con el extractor del recolector. */
const carpetaGrupo = join(base, `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
const htmlJornada = leer(join(carpetaGrupo, 'jornadas', `jornada-${jornada}.html`));
console.log(`\n=== 3. El HTML de la jornada ${jornada} archivado ===`);
if (!htmlJornada) console.log('  (no hay HTML de esa jornada)');
else {
  const clasicos = extraePartidos(htmlJornada);
  const widget = clasicos.length ? [] : extraePartidosWidget(htmlJornada);
  const usados = clasicos.length ? clasicos : widget;
  console.log(`  ${htmlJornada.length} caracteres · extractor clásico: ${clasicos.length} partidos · widget: ${widget.length}`);
  for (const [i, p] of usados.entries()) {
    const marca = String(p.codActa) === String(fila?.codigo_acta) ? '  ← es el acta de esta fila' : '';
    console.log(`    ${i}: ${p.local} (${p.codLocal}) ${p.golesLocal ?? '-'}-${p.golesVisitante ?? '-'} ${p.visitante} (${p.codVisitante}) · acta ${p.codActa}${marca}`);
  }
}

/* 3. La cabecera del acta archivada. */
console.log(`\n=== 4. La cabecera del acta archivada ${fila?.codigo_acta} ===`);
const rutaActa = acta?.archivo ? (acta.archivo.startsWith('actas') ? join(carpetaGrupo, acta.archivo) : acta.archivo) : null;
const htmlActa = rutaActa ? leer(rutaActa) : null;
if (!htmlActa) console.log(`  (no se pudo leer el acta: ${rutaActa})`);
else {
  const texto = htmlActa.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  const i = texto.search(/Jornada\s*\d+/i);
  console.log(`  ${htmlActa.length} caracteres · texto alrededor de la cabecera:`);
  console.log(`    …${texto.slice(Math.max(0, i - 60), i + 240)}…`);
}

/* 4. ¿Dónde aparece esa pareja en la cola? */
console.log(`\n=== 5. ¿De quién es la pareja que declara el acta? ===`);
const datos = db.prepare('select datos from actas where codigo=? and temporada=? and competicion=? and grupo=?')
  .get(fila?.codigo_acta, temporada, competicion, grupo)?.datos;
if (datos) {
  const d = JSON.parse(datos);
  console.log(`  el acta dice: ${d.local} vs ${d.visitante}`);
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const objetivo = [norm(d.local), norm(d.visitante)].sort().join(' || ');
  const coincidencias = db.prepare('select temporada, competicion, grupo, jornada, orden, local, visitante, codigo_acta from partidos').all()
    .filter((p) => [norm(p.local), norm(p.visitante)].sort().join(' || ') === objetivo);
  for (const p of coincidencias.slice(0, 6)) {
    const marca = p.temporada === temporada && p.competicion === competicion && p.grupo === grupo ? '  (mismo grupo)' : '';
    console.log(`    t${p.temporada} c${p.competicion} g${p.grupo} J${p.jornada} ord ${p.orden} · acta ${p.codigo_acta}${marca}`);
  }
  console.log(`  total de partidos en la cola con esa pareja: ${coincidencias.length}`);
}
db.close();
