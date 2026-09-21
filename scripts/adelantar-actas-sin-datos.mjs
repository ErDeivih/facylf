#!/usr/bin/env node
/**
 * Pone al día (sin aplazamiento) los trabajos de acta que el recolector puede cerrar ya: los que
 * esperan por una ficha que la federación publica sin datos. Sirve para que el cierre automático
 * (dos intentos en temporada cerrada) se aplique sin esperar a que venza la fecha.
 *
 * Sin --aplicar sólo informa.
 *
 * Uso: node scripts/adelantar-actas-sin-datos.mjs [--aplicar]
 */
import { readdirSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const aplicar = process.argv.includes('--aplicar');
let total = 0;
for (const d of readdirSync('.').filter((x) => x.startsWith('descargas-')).sort()) {
  const ruta = `${d}/recolector-local/cola-v2.sqlite`;
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: !aplicar });
  if (aplicar) db.exec('pragma busy_timeout=30000');
  const temporadaActual = Number(db.prepare('select max(cast(codigo as integer)) c from temporadas').get()?.c ?? 0);
  const filas = db.prepare(`select clave, temporada, intentos, siguiente_intento from trabajos
    where tipo='acta' and estado in ('pendiente','bloqueado')
      and ultimo_error like '%no se puede interpretar%'`).all()
    .filter((f) => Number(f.temporada) < temporadaActual);
  if (!filas.length) { db.close(); continue; }
  console.log(`${d.replace('descargas-', '')}: ${filas.length} trabajos`);
  for (const f of filas.slice(0, 4)) console.log(`   ${f.clave} intentos=${f.intentos} sig=${f.siguiente_intento}`);
  total += filas.length;
  if (aplicar) {
    const act = db.prepare(`update trabajos set siguiente_intento=null, prioridad=0, actualizado_en=?
      where clave=?`);
    const ahora = new Date().toISOString();
    db.exec('begin immediate');
    try { for (const f of filas) act.run(ahora, f.clave); db.exec('commit'); }
    catch (e) { db.exec('rollback'); throw e; }
  }
  db.close();
}
console.log(`\nTOTAL ${total} trabajos ${aplicar ? 'puestos al día' : 'por poner al día'}`);
if (!aplicar) console.log('Añade --aplicar para que el recolector los cierre ya con la regla nueva.');
