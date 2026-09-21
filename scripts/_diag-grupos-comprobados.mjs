#!/usr/bin/env node
/**
 * ¿Están marcadas como «grupos comprobados» las competiciones de cada cola?
 *
 *  La web sólo publica una competición si `competiciones.grupos_comprobados_en` tiene fecha: es su
 *  forma de saber que ya se conocen TODOS los grupos de esa competición. Si una federación nueva no
 *  lo rellena, su trabajo nunca llega a la web por muy completo que esté.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const r = db.prepare(`select
      (select count(*) from competiciones) competiciones,
      (select count(*) from competiciones where grupos_comprobados_en is not null) comprobadas,
      (select count(*) from grupos) grupos`).get();
    const pct = r.competiciones ? Math.round((r.comprobadas / r.competiciones) * 100) : 0;
    console.log(`${dir.replace('descargas-', '').padEnd(22)} competiciones ${String(r.competiciones).padStart(6)} · ` +
      `con grupos comprobados ${String(r.comprobadas).padStart(6)} (${String(pct).padStart(3)} %) · grupos ${String(r.grupos).padStart(7)}`);
  } catch (error) {
    console.log(`${dir}: ${error.message}`);
  }
  db.close();
}
