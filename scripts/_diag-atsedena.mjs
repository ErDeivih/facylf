#!/usr/bin/env node
/**
 * SÓLO LECTURA: ¿es `Atsedena` («el descanso») una fila de equipo o el bloque de descanso de la jornada?
 *
 * Una liga de número impar de equipos deja a uno descansando en cada jornada, y la página lo publica como
 * un bloque propio. En las PNFG ese bloque se leyó como un partido y produjo siete fugas de equipos
 * (ver §«La pareja de equipos» de IMPORTADOR-SQLITE.md). Aquí se comprueba si en la maqueta nova ocurre
 * lo mismo, con la evidencia delante.
 *
 * Uso: npx tsx scripts/_diag-atsedena.mjs --grupo 23233962
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', join(resolve(import.meta.dirname, '..'), 'pruebas', 'reconstruccion', 'ciclo')));
const db = new DatabaseSync(join(raiz, 'descargas-euskadi', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

/** Todas las filas cuyo nombre de equipo es una palabra de descanso, en cualquier federación. */
for (const [etiqueta, patron] of [['Atsedena', '%Atsedena%'], ['Descansa', '%Descansa%'], ['Descanso', '%Descanso%']]) {
  const n = db.prepare(`select count(*) n from partidos where local like ? or visitante like ?`).get(patron, patron).n;
  console.log(`${etiqueta.padEnd(10)} filas en partidos: ${n}`);
}

const grupo = arg('grupo');
const filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta,
    equipo_local_codigo cl, equipo_visitante_codigo cv, local, visitante, goles_local gl, goles_visitante gv,
    campo, arbitro from partidos where grupo = ? and (local like '%Atsedena%' or visitante like '%Atsedena%')
  order by jornada, orden`).all(grupo);
console.log(`\ngrupo ${grupo}: ${filas.length} fila(s) con «Atsedena»`);
for (const f of filas) {
  console.log(`  J${f.jornada} ord ${f.orden} · acta ${f.codigo_acta ?? 'NULL'} · códigos ${f.cl ?? 'NULL'}/${f.cv ?? 'NULL'}`
    + ` · marcador ${f.gl ?? 'NULL'}-${f.gv ?? 'NULL'} · campo ${f.campo ?? 'NULL'} · árbitro ${f.arbitro ?? 'NULL'}`);
  console.log(`      local «${f.local}» vs visitante «${f.visitante}»`);
}

// Cuántos partidos tiene esa misma jornada: si el descanso se colara como partido, la jornada tendría uno
// de más y el equipo que descansa aparecería dos veces.
if (filas.length) {
  const f = filas[0];
  const todos = db.prepare(`select orden, local, visitante, goles_local gl, goles_visitante gv from partidos
    where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
    .all(f.temporada, f.competicion, f.grupo, f.jornada);
  console.log(`\nla jornada J${f.jornada} completa (${todos.length} filas):`);
  for (const t of todos) console.log(`  ord ${t.orden} · ${t.local} vs ${t.visitante} · ${t.gl ?? 'NULL'}-${t.gv ?? 'NULL'}`);
  const equipos = db.prepare(`select count(*) n from equipos where temporada=?`).get(f.temporada).n;
  console.log(`  equipos con código en t${f.temporada}: ${equipos} · partidos en esta jornada: ${todos.length}`);
}

// El HTML: ¿cómo publica la fuente el bloque de descanso?
const j = filas.length
  ? db.prepare('select archivo from jornadas where temporada=? and competicion=? and grupo=? and numero=?')
    .get(filas[0].temporada, filas[0].competicion, filas[0].grupo, filas[0].jornada)
  : null;
if (j?.archivo) {
  const html = /\.gz$/i.test(j.archivo) && existsSync(j.archivo)
    ? gunzipSync(readFileSync(j.archivo)).toString('utf8')
    : (existsSync(j.archivo) ? readFileSync(j.archivo, 'utf8') : null);
  if (html) {
    const i = html.search(/Atsedena/i);
    console.log(`\nHTML (${j.archivo}) · ¿publica el bloque de descanso? ${i >= 0 ? 'SÍ' : 'NO — «Atsedena» no aparece'}`);
    if (i >= 0) console.log(`  …${html.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').slice(Math.max(0, i - 400), i + 200)}…`);
  } else {
    console.log(`\n(no se pudo leer ${j.archivo})`);
  }
}
db.close();
