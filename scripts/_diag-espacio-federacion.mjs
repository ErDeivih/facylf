#!/usr/bin/env node
/** Tamaño medio real de cada tipo de fichero POR federación, para saber dónde están los gigabytes. */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const RAIZ = resolve(import.meta.dirname, '..');
const interesa = process.argv[2] ? [process.argv[2]] : null;
for (const dir of readdirSync(RAIZ).filter((d) => d.startsWith('descargas-')).sort()) {
  if (interesa && !interesa.some((x) => dir.includes(x))) continue;
  const ruta = join(RAIZ, dir, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  const db = new DatabaseSync(ruta, { readOnly: true });
  const filas = db.prepare(`select tipo, count(*) n, sum(bytes) total, cast(avg(bytes) as int) media
    from archivos where tipo in ('acta','jornada') group by tipo order by total desc`).all();
  if (!filas.length) { db.close(); continue; }
  const partes = filas.map((f) => `${f.tipo} ${f.n}×${Math.round(f.media / 1024)} KB = ${(f.total / 1048576).toFixed(0)} MB`);
  console.log(`${dir.replace('descargas-', '').padEnd(22)} ${partes.join(' · ')}`);
  db.close();
}
