#!/usr/bin/env node
/** Última petición registrada en cada cola: dice si la ingesta sigue viva y a qué ritmo. */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
const colas = readdirSync(raiz).filter((d) => d.startsWith('descargas-'))
  .map((d) => join(raiz, d, 'recolector-local', 'cola-v2.sqlite'))
  .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });

const ahora = Date.now();
for (const ruta of colas) {
  try {
    const db = new DatabaseSync(ruta, { readOnly: true });
    const p = db.prepare('select iniciada_en, resultado, detalle, url from peticiones order by id desc limit 1').get();
    const pend = db.prepare(`select count(*) n from trabajos where estado in ('pendiente','en_curso','bloqueado')`).get().n;
    const edad = p ? Math.round((ahora - new Date(p.iniciada_en).getTime()) / 1000) : null;
    const nombre = ruta.replace(raiz, '').replace('\\recolector-local\\cola-v2.sqlite', '').replace('\\', '');
    console.log(`${nombre.padEnd(24)} última hace ${String(edad).padStart(6)} s · ${String(p?.resultado).padEnd(6)} ` +
      `${String(p?.detalle ?? '').slice(0, 22).padEnd(24)} pendientes ${String(pend).padStart(7)}`);
    db.close();
  } catch (error) {
    console.log(`${ruta}: ${error.message}`);
  }
}
