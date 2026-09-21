#!/usr/bin/env node
/**
 * Enseña el desplegable de grupos tal como lo publica la federación (fichero archivado) y lo que
 * nuestro extractor saca de él. Sirve para ver si los grupos que se quedan sin índice de jornadas
 * son opciones de relleno de la propia web.
 *
 * Uso: node scripts/_diag-desplegable-grupos.mjs <federacion> <temporada> <competicion>
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { leeArchivo, extraeGrupos } from './lib/recolector-local.mjs';

const [fed, temporada, competicion] = process.argv.slice(2);
const raiz = `descargas-${fed}/recolector-local`;
const db = new DatabaseSync(`${raiz}/cola-v2.sqlite`, { readOnly: true });
const candidatas = db.prepare(`select ruta, tipo, guardado_en from archivos
  where ruta like ? and (ruta like '%grupos.html%' or ruta like '%catalogo.html%')
  order by guardado_en desc limit 10`).all(`%comp-${competicion}%`);
const fila = candidatas[0];
console.log('candidatas:', candidatas.map((c) => c.ruta.replace(/.*recolector-local[\\/]/, '')).join(' | ') || 'ninguna');
const html = fila ? (leeArchivo(fila.ruta)?.toString('utf8') ?? '') : '';
if (!html) {
  console.log('no se pudo leer el HTML archivado');
} else {
  console.log(`HTML ${html.length} caracteres`);
  const opciones = [...html.matchAll(/<option[^>]*value=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/option>/gi)]
    .map((m) => ({ codigo: m[1], nombre: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() }))
    .filter((o) => o.nombre);
  console.log(`opciones <option> en el HTML: ${opciones.length}`);
  for (const o of opciones.slice(0, 40)) console.log(`   value=${o.codigo} → «${o.nombre}»`);
  console.log(`\nextraeGrupos() saca: ${JSON.stringify(extraeGrupos(html))}`);
  const selects = [...html.matchAll(/<select[^>]*name=["']?([\w-]+)["']?[^>]*>/gi)].map((m) => m[1]);
  console.log(`selects del HTML: ${[...new Set(selects)].join(', ')}`);
}
console.log('\ngrupos en la base para esa competición:');
for (const g of db.prepare(`select temporada, codigo, nombre, estado, jornadas from grupos where competicion=? order by temporada desc`).all(competicion)) {
  console.log(`   t${g.temporada} g${g.codigo} «${g.nombre}» ${g.estado} jornadas=${g.jornadas ?? '-'}`);
}
db.close();
