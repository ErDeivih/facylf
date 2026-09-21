#!/usr/bin/env node
/**
 * Enseña las páginas que el recolector rechazó (guardadas como `rechazada`) para una competición,
 * para saber qué contestó de verdad la federación cuando dijo que no había índice de jornadas.
 *
 * Uso: node scripts/_diag-rechazadas.mjs <federacion> <competicion> [temporada]
 */
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo } from './lib/recolector-local.mjs';

const [fed, competicion, temporada] = process.argv.slice(2);
const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
const filas = db.prepare(`select ruta, bytes, guardado_en from archivos where tipo='rechazada'
  and ruta like ? order by guardado_en desc limit 5`).all(`%comp-${competicion}%`);
console.log(`rechazadas de comp-${competicion}: ${filas.length}`);
for (const f of filas) {
  const html = leeArchivo(f.ruta)?.toString('utf8') ?? '';
  console.log(`\n== ${f.ruta.replace(/.*recolector-local[\\/]/, '')} · ${f.bytes} B · ${f.guardado_en}`);
  console.log(`   leídos ${html.length} caracteres`);
  const visible = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
  console.log(`   visible: ${visible.slice(0, 300)}`);
}
if (!filas.length) {
  const peticiones = db.prepare(`select iniciada_en, trabajo, url, resultado, detalle from peticiones
    where trabajo like ? order by id desc limit 8`).all(`%|${competicion}|%`);
  console.log('últimas peticiones relacionadas:');
  for (const p of peticiones) console.log(`   ${p.iniciada_en} [${p.resultado}] ${String(p.trabajo).slice(0, 40)} → ${String(p.detalle).slice(0, 80)}`);
}
db.close();
