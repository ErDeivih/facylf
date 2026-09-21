#!/usr/bin/env node
/**
 * Fichas que la federación publica sin datos: cuántas hay ya cerradas como `sin_datos` (no bloquean) y
 * cuántas siguen pendientes de cerrar, con los grupos que aún dependen de ellas.
 *
 *  El número que importa es el segundo: mientras una ficha siga con trabajo vivo, su grupo no se
 *  publica. El recolector las cierra solo (dos intentos en temporada cerrada), así que esta lista
 *  debería ir a cero; si no lo hace, aquí se ve dónde.
 *
 * Uso: node scripts/_diag-actas-sin-datos.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, existsSync } from 'node:fs';

let totalCerradas = 0;
let totalPendientes = 0;
let totalGrupos = 0;
const filas = [];
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const cerradas = db.prepare("select count(*) n from actas where estado='sin_datos'").get().n;
  const pendientes = db.prepare(`select count(*) n from trabajos where tipo='acta'
    and estado in ('pendiente','bloqueado') and ultimo_error like '%no se puede interpretar%'`).get().n;
  const grupos = db.prepare(`select count(*) n from (select distinct temporada, competicion, grupo
    from trabajos where tipo='acta' and estado in ('pendiente','bloqueado')
      and ultimo_error like '%no se puede interpretar%')`).get().n;
  const vencidos = db.prepare(`select count(*) n from trabajos where tipo='acta'
    and estado in ('pendiente','bloqueado') and ultimo_error like '%no se puede interpretar%'
    and (siguiente_intento is null or siguiente_intento <= ?)`).get(new Date().toISOString()).n;
  const temporadas = db.prepare(`select estado, min(temporada) tmin, max(temporada) tmax, count(*) n
    from actas where estado='sin_datos' group by estado`).all()
    .map((x) => `${x.estado}=${x.n} (t${x.tmin}-${x.tmax})`).join(' · ');
  if (!cerradas && !pendientes) { db.close(); continue; }
  totalCerradas += cerradas;
  totalPendientes += pendientes;
  totalGrupos += grupos;
  filas.push({ fed: d.replace('descargas-', ''), cerradas, pendientes, vencidos, grupos, temporadas });
  db.close();
}
console.log('federación            cerradas (sin_datos)  pendientes de cerrar  vencidos  grupos afectados  temporadas');
for (const f of filas) {
  console.log(`${f.fed.padEnd(21)} ${String(f.cerradas).padStart(20)} ${String(f.pendientes).padStart(21)} ${String(f.vencidos).padStart(9)} ${String(f.grupos).padStart(17)}  ${f.temporadas}`);
}
console.log(`\nTOTAL ${totalCerradas} fichas cerradas como «sin datos» · ${totalPendientes} aún con trabajo vivo (${totalGrupos} grupos dependen de ellas)`);
console.log('Las vencidas son las que el recolector puede cerrar ya (dos intentos en temporada cerrada); las demás están aplazadas a su fecha.');
