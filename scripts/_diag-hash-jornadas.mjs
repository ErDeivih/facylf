#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: ¿la página archivada es la MISMA que se parseó para escribir la cola?
 *
 * `guardaAtomico` deja en `archivos.hash` el sha256 de los bytes sin comprimir, y `registraJornada`
 * copia ese mismo hash a `jornadas.hash`. Si el fichero de disco sigue dando ese hash, la fila de
 * `partidos` salió de ESTE HTML y la culpa es del parser. Si no coincide, la página se volvió a
 * descargar después y lo que hay en la cola es una lectura vieja.
 *
 * Uso: node scripts/_diag-hash-jornadas.mjs [temporada] [etiqueta] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const [temporada = '20', etiqueta = '2024-25', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const base = join(raiz, 'descargas-federacion', 'recolector-local', `t${temporada}-${etiqueta}`, `comp-${competicion}`, `grupo-${grupo}`);
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const sospechosas = new Set([8, 9, 23, 33, 34, 36, 37]);
const jornadas = db.prepare(`select numero, fecha, archivo, hash, comprobada_en from jornadas
  where temporada = ? and competicion = ? and grupo = ? order by numero`).all(temporada, competicion, grupo);

const sha = (ruta) => {
  const bytes = /\.gz$/i.test(ruta) ? gunzipSync(readFileSync(ruta)) : readFileSync(ruta);
  return createHash('sha256').update(bytes).digest('hex');
};

let iguales = 0, distintas = 0, sinArchivo = 0;
console.log('J  · cola/HTML · archivo en disco · hash en archivos · comprobada_en');
for (const j of jornadas) {
  const ruta = j.archivo ?? join(base, 'jornadas', `jornada-${j.numero}.html.gz`);
  const candidatas = [ruta, `${ruta}.gz`, ruta.replace(/\.gz$/, '')];
  const existente = candidatas.find((r) => existsSync(r));
  const marca = sospechosas.has(j.numero) ? '⚠' : ' ';
  if (!existente) { sinArchivo++; console.log(`${marca}J${j.numero}: sin archivo (${ruta})`); continue; }
  const actual = sha(existente);
  const filaArchivo = db.prepare('select hash, guardado_en from archivos where ruta = ?').get(existente)
    ?? db.prepare('select hash, guardado_en from archivos where ruta = ?').get(ruta);
  const coincideArchivo = filaArchivo?.hash === actual;
  const coincideJornada = j.hash === actual;
  if (coincideJornada && coincideArchivo) iguales++;
  else { distintas++; }
  if (!coincideJornada || !coincideArchivo) {
    console.log(`${marca}J${String(j.numero).padStart(2)}: ${coincideJornada ? 'igual' : 'DISTINTO'} · ${filaArchivo?.guardado_en ?? '—'} · jornadas.hash=${(j.hash ?? '—').slice(0, 12)} actual=${actual.slice(0, 12)} archivos.hash=${(filaArchivo?.hash ?? '—').slice(0, 12)}`);
  }
}
console.log(`\ncoinciden: ${iguales} · no coinciden: ${distintas} · sin archivo: ${sinArchivo}`);

/* El motivo por el que la firma de `partidos` puede cambiar sin que cambie el fichero: la
   comprobación de la fecha de descarga. */
console.log('\nfechas de petición de cada jornada (tabla peticiones, si existe):');
try {
  const filas = db.prepare(`select url, iniciada_en from peticiones where url like '%jornada%' order by iniciada_en`).all();
  const porJornada = new Map();
  for (const f of filas) {
    const m = /jornada=(\d+)/i.exec(f.url ?? '');
    if (!m) continue;
    if (!porJornada.has(m[1])) porJornada.set(m[1], []);
    porJornada.get(m[1]).push(f.iniciada_en);
  }
  for (const n of ['8', '9', '23', '33', '34', '36', '37', '7', '10']) {
    console.log(`  jornada=${n}: ${(porJornada.get(n) ?? []).join(', ') || 'sin peticiones registradas'}`);
  }
} catch (e) { console.log(`  no se pudo leer: ${e.message}`); }

db.close();
