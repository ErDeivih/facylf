#!/usr/bin/env node
/**
 * Mueve las carpetas de grupo de Cataluña a su sitio: `descargas-cataluna/recolector-local/`.
 *
 *  El resto de federaciones guardan los datos de cada grupo bajo `recolector-local/`, y la web
 *  construye ahí la ruta para leer el calendario y la clasificación. El adaptador de la FCF las
 *  estaba escribiendo un nivel por encima, así que la web no encontraba esos ficheros y mostraba la
 *  clasificación recalculada en vez de la oficial (y no habría leído nunca el calendario guardado).
 *
 *  También actualiza las rutas absolutas ya guardadas en la base (`archivos`, `actas`, `jornadas`),
 *  que si no apuntarían a ficheros que ya no están.
 *
 * Uso: node scripts/_diag-mover-carpetas-cataluna.mjs [--aplicar]
 */
import { existsSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const BASE = join(RAIZ, 'descargas-cataluna');
const DESTINO = join(BASE, 'recolector-local');
const aplicar = process.argv.includes('--aplicar');

const carpetas = readdirSync(BASE).filter((d) => /^t\d+-/.test(d));
console.log(`carpetas de grupo encontradas: ${carpetas.length} → ${carpetas.slice(0, 4).join(', ')}${carpetas.length > 4 ? ' …' : ''}`);
const yaEnSitio = existsSync(join(DESTINO, 't21-2025-26'));
console.log(`¿ya están en recolector-local? ${yaEnSitio ? 'sí' : 'no'}`);
if (!aplicar) {
  console.log('\n(sin --aplicar no se toca nada)');
  process.exit(0);
}
for (const d of carpetas) {
  const origen = join(BASE, d);
  const destino = join(DESTINO, d);
  if (existsSync(destino)) { console.log(`  ${d}: ya existe en el destino, se salta`); continue; }
  renameSync(origen, destino);
  console.log(`  ${d}: movida`);
}

const db = new DatabaseSync(join(DESTINO, 'cola-v2.sqlite'));
const viejo = join(BASE, 't');
const nuevo = join(DESTINO, 't');
let total = 0;
for (const [tabla, columna] of [['archivos', 'ruta'], ['actas', 'archivo'], ['jornadas', 'archivo']]) {
  const r = db.prepare(`update ${tabla} set ${columna}=replace(${columna}, ?, ?)
    where ${columna} like ?`).run(viejo, nuevo, `${BASE}\\%`);
  console.log(`  ${tabla}.${columna}: ${r.changes} rutas actualizadas`);
  total += Number(r.changes ?? 0);
}
console.log(`rutas corregidas en total: ${total}`);
db.close();
