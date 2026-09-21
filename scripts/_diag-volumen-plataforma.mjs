#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const totales = {};
for (const carpeta of readdirSync(process.cwd()).filter((x) => x.startsWith('descargas-'))) {
  const ruta = join(process.cwd(), carpeta, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const fila = { federacion: carpeta.replace(/^descargas-/, '') };
  for (const tabla of ['temporadas', 'competiciones', 'grupos', 'jornadas', 'partidos', 'actas',
    'personas', 'participaciones', 'tecnicos_acta', 'eventos_acta']) {
    try { fila[tabla] = db.prepare(`select count(*) n from ${tabla}`).get().n; }
    catch { fila[tabla] = 0; }
    totales[tabla] = (totales[tabla] ?? 0) + fila[tabla];
  }
  console.log(JSON.stringify(fila));
  db.close();
}
console.log(`TOTAL ${JSON.stringify(totales)}`);
