#!/usr/bin/env node
/**
 * SÓLO LECTURA: localiza el HTML archivado de una jornada concreta y comprueba que se puede abrir.
 *
 * Uso: npx tsx scripts/_diag-ruta-jornada.mjs --federacion <fed> --grupo <g> [--jornada <n>]
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const arg = (n, pordefecto) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : pordefecto; };
const raiz = resolve(arg('raiz', resolve(import.meta.dirname, '..')));
const federacion = arg('federacion', 'euskadi');
const grupo = arg('grupo');
const db = new DatabaseSync(join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const PATRON = `%escans%`;
const filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, local, visitante, codigo_acta
  from partidos where grupo = ? and (local like ? or visitante like ? or local like '%tsedena%' or visitante like '%tsedena%')
  order by jornada, orden`).all(grupo, PATRON, PATRON);
console.log(`grupo ${grupo}: ${filas.length} fila(s) con palabra de descanso`);
const vistos = new Set();
for (const f of filas) {
  const k = `${f.temporada}|${f.competicion}|${f.grupo}|${f.jornada}`;
  if (vistos.has(k)) continue;
  vistos.add(k);
  const j = db.prepare('select archivo, hash from jornadas where temporada=? and competicion=? and grupo=? and numero=?')
    .get(f.temporada, f.competicion, f.grupo, f.jornada);
  const ruta = j?.archivo ?? '(sin archivo en la cola)';
  const candidatos = [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')];
  const existe = candidatos.find((c) => existsSync(c)) ?? null;
  console.log(`\n  t${f.temporada} c${f.competicion} J${f.jornada}`);
  console.log(`    archivo en la cola: ${ruta}`);
  console.log(`    existe: ${existe ?? 'NO'}`);
  if (existe) {
    console.log(`    carpeta de hermana: ${existsSync(join(dirname(existe), 'clasificacion.html')) || existsSync(join(dirname(existe), 'clasificacion.html.gz')) ? 'tiene clasificacion.html' : 'sin clasificacion.html'}`);
  } else if (j?.archivo) {
    // Se busca la carpeta real del grupo por si la ruta guardada apunta a un fichero con otro nombre.
    const carpeta = dirname(j.archivo);
    console.log(`    ¿existe la carpeta ${carpeta}? ${existsSync(carpeta) ? 'SÍ' : 'NO'}`);
  }
  console.log(`    fila: ord ${f.orden} «${f.local}» vs «${f.visitante}» · acta ${f.codigo_acta ?? 'NULL'}`);
}
db.close();
