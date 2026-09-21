#!/usr/bin/env node
/**
 * ¿Cuántas actas se quedaron sin poder descargarse y bloquean la publicación de su grupo?
 *
 *  El portal de la web sólo publica un grupo cuando NINGUNA de sus actas está en un estado distinto
 *  de «hecha». Si una acta no existe en la fuente (página vacía), su trabajo se cancela pero la fila
 *  se queda pendiente para siempre… y el grupo no se publica nunca.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
let totalActas = 0; let totalGrupos = 0;
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  try {
    const r = db.prepare(`select
        (select count(*) from actas a where a.estado<>'hecha'
          and exists(select 1 from trabajos t where t.tipo='acta' and t.estado='cancelado'
            and t.temporada=a.temporada and t.competicion=a.competicion and t.grupo=a.grupo
            and t.jornada=a.jornada and t.acta=a.codigo)) actasBloqueadas,
        (select count(distinct a.temporada||'-'||a.competicion||'-'||a.grupo) from actas a
          where a.estado<>'hecha'
          and exists(select 1 from trabajos t where t.tipo='acta' and t.estado='cancelado'
            and t.temporada=a.temporada and t.competicion=a.competicion and t.grupo=a.grupo
            and t.jornada=a.jornada and t.acta=a.codigo)) gruposBloqueados`).get();
    if (r.actasBloqueadas || r.gruposBloqueados) {
      console.log(`${dir.replace('descargas-', '').padEnd(22)} actas canceladas sin bajar: ${String(r.actasBloqueadas).padStart(5)} · grupos afectados: ${r.gruposBloqueados}`);
      totalActas += r.actasBloqueadas; totalGrupos += r.gruposBloqueados;
    }
  } catch (error) {
    console.log(`${dir}: ${error.message}`);
  }
  db.close();
}
console.log(`\ntotal: ${totalActas} actas y ${totalGrupos} grupos afectados`);
