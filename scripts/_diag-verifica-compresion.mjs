#!/usr/bin/env node
/** Comprueba que los ficheros archivados comprimidos se leen bien con la librería del proyecto. */
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { leeArchivo } from './lib/recolector-local.mjs';

const federacion = process.argv[2] ?? 'baleares';
const dir = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(resolve(import.meta.dirname, '..'), dir, 'recolector-local',
  'cola-v2.sqlite'), { readOnly: true });
const total = db.prepare(`select count(*) n, sum(bytes) b from archivos where ruta like '%.gz'`).get();
console.log(`${federacion}: ficheros comprimidos guardados: ${total.n ?? 0} (${Math.round((total.b ?? 0) / 1024)} KB en disco)`);
const filas = db.prepare(`select ruta, tipo, bytes from archivos where ruta like '%.gz'
  order by guardado_en desc limit 3`).all();
for (const f of filas) {
  const contenido = leeArchivo(f.ruta);
  console.log(`  ${f.tipo.padEnd(12)} ${String(f.bytes).padStart(7)} B en disco · ` +
    `${contenido ? `${contenido.length} B leídos ✅` : 'NO se pudo leer ❌'} · …${f.ruta.slice(-58)}`);
}
const sinComprimir = db.prepare(`select count(*) n, sum(bytes) b from archivos
  where ruta not like '%.gz' and bytes >= 8192`).get();
console.log(`  (sin comprimir y >8 KB, de antes del cambio: ${sinComprimir.n ?? 0} ficheros, ` +
  `${Math.round((sinComprimir.b ?? 0) / 1048576)} MB)`);
db.close();
