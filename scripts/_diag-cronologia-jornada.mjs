#!/usr/bin/env node
/**
 * Diagnóstico de SÓLO LECTURA: cronología. ¿Se escribieron las filas de `partidos` ANTES o DESPUÉS de
 * archivar la página que ahora mismo hay en disco?
 *
 * Si `archivos.guardado_en` es posterior a `partidos.actualizado_en`, la cola conserva una lectura
 * vieja de una página que después se volvió a descargar (y la fuente pudo corregirla). Si es anterior
 * o igual, la fila salió de este HTML y el fallo está en el recolector.
 *
 * Uso: node scripts/_diag-cronologia-jornada.mjs [temporada] [etiqueta] [competicion] [grupo]
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve, join } from 'node:path';

const [temporada = '20', etiqueta = '2024-25', competicion = '11379751', grupo = '11379752'] = process.argv.slice(2);
const raiz = resolve(import.meta.dirname, '..');
const db = new DatabaseSync(join(raiz, 'descargas-federacion', 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

const sospechosas = new Set([8, 9, 23, 33, 34, 36, 37]);
console.log('J  · archivo guardado_en        · partidos actualizado_en     · veredicto');
for (const j of db.prepare(`select numero, archivo, hash, comprobada_en from jornadas
    where temporada=? and competicion=? and grupo=? order by numero`).all(temporada, competicion, grupo)) {
  const filaArchivo = db.prepare('select guardado_en from archivos where ruta = ?').get(j.archivo ?? '');
  const p = db.prepare(`select min(actualizado_en) as desde, max(actualizado_en) as hasta, count(*) n
      from partidos where temporada=? and competicion=? and grupo=? and jornada=?`)
    .get(temporada, competicion, grupo, j.numero);
  const guardado = filaArchivo?.guardado_en ?? null;
  const veredicto = !guardado || !p?.hasta ? '—' : guardado > p.hasta ? 'ARCHIVO POSTERIOR (cola vieja)' : 'archivo ≤ filas (mismo HTML)';
  console.log(`${sospechosas.has(j.numero) ? '⚠' : ' '}J${String(j.numero).padStart(2)} · ${(guardado ?? '—').padEnd(28)} · ${(p?.desde ?? '—')} → ${(p?.hasta ?? '—')} (${p?.n ?? 0} filas) · ${veredicto}`);
}

console.log('\n--- jornadas y actas de los partidos sospechosos ---');
for (const [j, orden] of [[8, 0], [9, 0], [23, 0], [33, 0], [34, 0], [36, 0], [37, 0]]) {
  const p = db.prepare(`select orden, codigo_acta, local, visitante, goles_local, goles_visitante, actualizado_en
      from partidos where temporada=? and competicion=? and grupo=? and jornada=? and orden=?`)
    .get(temporada, competicion, grupo, j, orden);
  console.log(`  J${j} ord ${orden}: ${p?.local} ${p?.goles_local}-${p?.goles_visitante} ${p?.visitante} · acta ${p?.codigo_acta} · actualizado ${p?.actualizado_en}`);
  if (p?.codigo_acta) {
    const a = db.prepare('select codigo, estado, calidad, archivo, comprobada_en, version_parser from actas where codigo=? and temporada=? and competicion=? and grupo=?')
      .get(p.codigo_acta, temporada, competicion, grupo);
    console.log(`      acta en la cola: ${JSON.stringify(a)}`);
    const filaArchivo = db.prepare('select ruta, guardado_en, bytes from archivos where ruta like ?').get(`%acta-${p.codigo_acta}.html%`);
    console.log(`      archivo del acta: ${JSON.stringify(filaArchivo)}`);
  }
}

db.close();
