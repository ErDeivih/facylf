#!/usr/bin/env node
/*
 * Cuenta las peticiones de cada federación dentro de una ventana de tiempo exacta.
 *
 * Existe para poder cruzar «cuántas peticiones ha hecho» con «cuánta CPU ha gastado» en el MISMO intervalo:
 * sólo así se puede decir cuántos segundos de procesador cuesta una petición, que es la pregunta que decide
 * si el techo lo pone el portal o la máquina.
 *
 * Uso:
 *   node cuenta-peticiones-ventana.mjs <desdeISO> <hastaISO>
 * Imprime líneas «federacion<TAB>peticiones».
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.env.FACYLF_RAIZ ?? '/app';
const [desde, hasta] = process.argv.slice(2);
if (!desde || !hasta) {
  console.error('uso: cuenta-peticiones-ventana.mjs <desdeISO> <hastaISO>');
  process.exit(2);
}

const federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => !f.startsWith('prueba') && !f.endsWith('-sondeo'))
  .sort();

for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(ruta)) continue;
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true, timeout: 20_000 });
    const n = db.prepare('select count(*) n from peticiones where iniciada_en >= ? and iniciada_en < ?')
      .get(desde, hasta).n;
    console.log(`${federacion}\t${n}`);
  } catch {
    console.log(`${federacion}\t?`);
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}
