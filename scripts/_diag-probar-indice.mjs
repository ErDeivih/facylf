#!/usr/bin/env node
/**
 * Pide en vivo la página del índice de jornadas de un grupo concreto (normalmente el grupo fantasma
 * cuyo código es el de la competición) y cuenta cuántas jornadas ofrece la federación.
 *
 * Uso: node scripts/_diag-probar-indice.mjs <federacion> <temporada> <competicion> <grupo>
 */
import { DatabaseSync } from 'node:sqlite';
import { leeArchivo, extraeJornadas } from './lib/recolector-local.mjs';

const [fed, temporada, competicion, grupo] = process.argv.slice(2);
const raiz = `descargas-${fed}/recolector-local`;
const db = new DatabaseSync(`${raiz}/cola-v2.sqlite`, { readOnly: true });

const peticion = db.prepare(`select url, iniciada_en, resultado, detalle from peticiones
  where trabajo like ? order by id desc limit 1`).get(`indice_jornadas|${temporada}|${competicion}|${grupo}%`);
console.log('última petición registrada:', peticion ? `${peticion.resultado} ${peticion.detalle} · ${peticion.url}` : 'ninguna');

const archivo = db.prepare(`select ruta from archivos where ruta like ? order by guardado_en desc limit 1`)
  .get(`%comp-${competicion}/grupo-${grupo}/%`);
console.log('archivo del grupo:', archivo?.ruta?.replace(/.*recolector-local[\\/]/, '') ?? 'ninguno');
if (archivo) {
  const html = leeArchivo(archivo.ruta)?.toString('utf8') ?? '';
  console.log(`  HTML archivado: ${html.length} caracteres · jornadas detectadas: ${JSON.stringify(extraeJornadas(html).map((j) => j.numero))}`);
}

const url = peticion?.url ?? null;
if (!url) { console.log('sin URL para probar en vivo'); db.close(); process.exit(0); }
console.log(`\npido en vivo: ${url}`);
try {
  const r = await fetch(url, {
    headers: { 'user-agent': 'FACyLF/1.0 (+recoleccion responsable)', accept: 'text/html,application/xhtml+xml' },
    signal: AbortSignal.timeout(45_000),
  });
  const texto = await r.text();
  const jornadas = extraeJornadas(texto);
  console.log(`HTTP ${r.status} · ${texto.length} B · jornadas detectadas: ${jornadas.length}`);
  console.log('  números:', JSON.stringify(jornadas.map((j) => j.numero).slice(0, 40)));
  const visible = texto.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
  console.log('  texto visible:', visible.slice(0, 400));
} catch (error) {
  console.log('error:', error instanceof Error ? error.message : String(error));
}
db.close();
