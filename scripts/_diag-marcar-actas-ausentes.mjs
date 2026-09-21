#!/usr/bin/env node
/**
 * Marca como `ausente_web` las actas que la fuente no publica y cuyo trabajo ya se canceló.
 *
 *  El recolector ya lo hace solo desde hoy cuando descarta un acta tras tres intentos, pero las que
 *  se cancelaron ANTES de ese cambio se quedaron en `pendiente` para siempre, y con ellas sus grupos
 *  sin poder publicarse nunca (la web sólo publica un grupo cuando ninguna de sus actas está fuera de
 *  `hecha`). Esto lo aplica una vez sobre lo ya cancelado.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta);
  try {
    const r = db.prepare(`update actas set estado='ausente_web', incidencias=?
      where estado<>'hecha' and exists (
        select 1 from trabajos t where t.tipo='acta' and t.estado='cancelado'
          and t.temporada=actas.temporada and t.competicion=actas.competicion
          and t.grupo=actas.grupo and t.jornada=actas.jornada and t.acta=actas.codigo)`)
      .run(JSON.stringify(['el recolector descartó esta acta: la fuente no la publica']));
    if (Number(r.changes ?? 0)) {
      console.log(`${dir.replace('descargas-', '').padEnd(22)} ${r.changes} actas marcadas como ausentes`);
    }
  } catch (error) {
    console.log(`${dir}: ${error.message}`);
  }
  db.close();
}
