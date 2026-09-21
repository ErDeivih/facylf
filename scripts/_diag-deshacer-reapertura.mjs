#!/usr/bin/env node
/**
 * Deshace una reapertura demasiado amplia de trabajos de acta.
 *
 * Contexto: `_diag-reabrir-actas-sin-hora.mjs` reabrió 5.428 trabajos de acta en seis federaciones
 * para completar hora y campo del partido. Eso sólo tiene sentido en Cataluña, cuyo intérprete ya lee
 * ese bloque: en las federaciones pnfg la hora y el campo no salen del acta, así que volver a pedir
 * esas fichas habría sido gastar miles de peticiones para nada.
 *
 * Se restauran EXACTAMENTE los trabajos que se reabrieron: los que están pendientes pero cuyo acta ya
 * consta como `hecha`. Las actas realmente pendientes tienen su fila en estado `pendiente` y no se
 * tocan.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const ahora = new Date().toISOString();
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-'))) {
  if (dir === 'descargas-cataluna') continue; // en Cataluña la reapertura era deliberada
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta);
  const hay = db.prepare(`select count(*) n from sqlite_master where type='table' and name='actas'`).get().n;
  if (!hay) { db.close(); continue; }
  try {
    const r = db.prepare(`update trabajos set estado='hecho', actualizado_en=?
      where tipo='acta' and estado='pendiente' and exists (
        select 1 from actas a where a.codigo=trabajos.acta and a.temporada=trabajos.temporada
          and a.competicion=trabajos.competicion and a.grupo=trabajos.grupo
          and a.jornada=trabajos.jornada and a.estado='hecha')`).run(ahora);
    if (Number(r.changes ?? 0)) console.log(`  ${dir}: ${r.changes} trabajos restaurados a 'hecho'`);
  } catch (error) {
    console.log(`  ${dir}: ${error.message}`);
  }
  db.close();
}
