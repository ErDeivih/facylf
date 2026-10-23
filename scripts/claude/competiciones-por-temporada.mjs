#!/usr/bin/env node
/* competiciones-por-temporada.mjs — SÓLO LEE. Competiciones y grupos por temporada en la cola (para compararlas
 * con lo que publica la web). Uso: node competiciones-por-temporada.mjs fed…   (FACYLF_RAIZ, por defecto /app) */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
for (const fed of process.argv.slice(2)) {
  try {
    const db = new DatabaseSync(join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true, timeout: 60000 });
    const f = db.prepare(`select t.etiqueta, (select count(*) from competiciones c where c.temporada=t.codigo) comps,
        (select count(*) from grupos g where g.temporada=t.codigo and g.estado='presente') grupos
      from temporadas t order by t.etiqueta desc`).all();
    console.log(`${fed.padEnd(12)} ${f.map((x) => `${x.etiqueta.slice(2)}:${x.comps}/${x.grupos}`).join(' ')}`);
    db.close();
  } catch (e) { console.log(`${fed}: ${String(e.message).slice(0, 80)}`); }
}
