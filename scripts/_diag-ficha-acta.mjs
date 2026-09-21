#!/usr/bin/env node
/** Ficha completa de unas actas concretas: fila, trabajo de cola y peticiones. */
import { DatabaseSync } from 'node:sqlite';

const [rutaDb, ...codigos] = process.argv.slice(2);
const db = new DatabaseSync(rutaDb, { readOnly: true });
for (const codigo of codigos) {
  const a = db.prepare(`select codigo,temporada,competicion,grupo,jornada,estado,calidad,incidencias,
    version_parser,comprobada_en,length(datos) largo,archivo from actas where codigo=?`).get(codigo);
  console.log(`== ${codigo}`);
  if (!a) { console.log('   sin fila de acta'); continue; }
  console.log(`   t${a.temporada} c${a.competicion} g${a.grupo} J${a.jornada} · estado=${a.estado} · calidad=${a.calidad} · v${a.version_parser}`);
  console.log(`   comprobada_en=${a.comprobada_en} · datos=${a.largo} B · incidencias=${a.incidencias}`);
  console.log(`   archivo=${a.archivo}`);
  const t = db.prepare(`select estado,intentos,ultimo_error,siguiente_intento,actualizado_en
    from trabajos where tipo='acta' and acta=?`).get(codigo);
  console.log(`   trabajo: ${t ? `${t.estado} intentos=${t.intentos} sig=${t.siguiente_intento} err=${t.ultimo_error} act=${t.actualizado_en}` : 'sin fila'}`);
}
db.close();
