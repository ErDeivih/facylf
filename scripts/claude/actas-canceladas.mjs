#!/usr/bin/env node
/* actas-canceladas.mjs — SÓLO LEE. Trabajos de acta cancelados o fallidos, por motivo (primeros 55 caracteres del error)
 * y temporada: separa «no hay nada que leer» (página vacía, sin datos) de «se descargó y no se supo leer» (arreglable).
 * Uso: node actas-canceladas.mjs fed…   (FACYLF_RAIZ, por defecto /app) */
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
for (const fed of process.argv.slice(2)) {
  const ruta = join(RAIZ, `descargas-${fed}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  try {
    const db = new DatabaseSync(ruta, { readOnly: true, timeout: 60000 });
    const filas = db.prepare(`select substr(coalesce(ultimo_error,'(sin error)'),1,55) m, count(*) n,
        group_concat(distinct (select etiqueta from temporadas t where t.codigo=w.temporada)) ts
      from trabajos w where tipo='acta' and estado in ('cancelado','fallido','fallida','error') group by 1 order by 2 desc limit 5`).all();
    const total = filas.reduce((a, f) => a + f.n, 0);
    console.log(`${fed.padEnd(19)} ${total} actas canceladas/fallidas`);
    for (const f of filas) console.log(`     ${String(f.n).padStart(6)}  ${f.m}  [${String(f.ts ?? '').split(',').sort().join(' ').slice(0, 90)}]`);
    db.close();
  } catch (e) { console.log(`${fed}: ${String(e.message).slice(0, 90)}`); }
}
