#!/usr/bin/env node
/** Cuántas de las actas devueltas a la cola por el fallo del HTML ya se han recuperado. */
import { DatabaseSync } from 'node:sqlite';

for (const fed of process.argv.slice(2)) {
  const db = new DatabaseSync(`descargas-${fed}/recolector-local/cola-v2.sqlite`, { readOnly: true });
  const pendientes = db.prepare(`select count(*) n from trabajos where tipo='acta'
    and estado='pendiente' and ultimo_error like '%html archivado perdido%'`).get().n;
  const recuperadas = db.prepare(`select count(*) n from actas where incidencias is null or incidencias not like '%html archivado perdido%'`).get().n;
  const hechas = db.prepare(`select count(*) n from actas where estado='hecha'`).get().n;
  const conHtml = db.prepare(`select count(*) n from actas where estado='hecha' and archivo is not null`).get().n;
  console.log(`${fed.padEnd(12)} pendientes_de_recuperar=${String(pendientes).padStart(5)} · actas hechas=${hechas} (con archivo=${conHtml})`);
  db.close();
}
