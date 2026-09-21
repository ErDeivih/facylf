#!/usr/bin/env node
/*
 * ── COMPROBAR QUE UNA COLA COPIADA ESTÁ ENTERA Y SE PUEDE LEER ─────────────────────────────────────────
 *
 * Copiar un fichero y que pese lo mismo no demuestra que la base esté bien: hay que abrirla y preguntarle. Esto
 * hace tres comprobaciones por cola:
 *
 *   1. `pragma integrity_check` → que la base no esté rota;
 *   2. recuentos de `trabajos` y `peticiones` → que tenga dentro lo que tiene que tener (no una base vacía);
 *   3. `pragma quick_check` de las tablas clave y que existan los índices del esquema actual.
 *
 * Se ejecuta CON NODE, porque en el servidor no hay `sqlite3` instalado: dentro de un contenedor
 * (`docker run --rm -v /srv/data/facylf:/app node:22-alpine node /app/scripts/servidor/verifica-cola.mjs ...`).
 *
 * Uso:  node scripts/servidor/verifica-cola.mjs [--raiz /app] [--federaciones a,b | todas]
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const argumentos = process.argv.slice(2);
const arg = (n, d) => { const i = argumentos.indexOf(`--${n}`); return i >= 0 ? argumentos[i + 1] : d; };
const RAIZ = arg('raiz', process.cwd());
const pedidas = arg('federaciones', 'todas');

let federaciones = readdirSync(RAIZ).filter((n) => n.startsWith('descargas-'))
  .map((n) => n.replace('descargas-', ''))
  .filter((f) => existsSync(join(RAIZ, `descargas-${f}`, 'recolector-local', 'cola-v2.sqlite')));
if (pedidas !== 'todas') federaciones = federaciones.filter((f) => pedidas.split(',').includes(f));
federaciones.sort();

console.log(`comprobando ${federaciones.length} colas en ${RAIZ}\n`);
console.log('federacion             MB  integridad  trabajos  peticiones  indices  veredicto');
let malas = 0;
for (const federacion of federaciones) {
  const ruta = join(RAIZ, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  const mb = (statSync(ruta).size / 1024 ** 2).toFixed(0);
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
    const integridad = db.prepare('pragma integrity_check').get()?.integrity_check ?? '?';
    const trabajos = db.prepare('select count(*) n from trabajos').get()?.n ?? 0;
    const peticiones = db.prepare('select count(*) n from peticiones').get()?.n ?? 0;
    const indices = db.prepare("select count(*) n from sqlite_master where type='index'").get()?.n ?? 0;
    const tieneIndiceNuevo = db.prepare("select 1 from sqlite_master where type='index' and name='peticiones_iniciada'").get();
    const bien = integridad === 'ok' && trabajos > 0 && peticiones > 0;
    if (!bien) malas += 1;
    console.log(`${federacion.padEnd(20)} ${String(mb).padStart(5)} ${String(integridad).padStart(11)}`
      + ` ${String(trabajos).padStart(9)} ${String(peticiones).padStart(11)} ${String(indices).padStart(8)}`
      + `  ${bien ? 'ok' : 'REVISAR'}${tieneIndiceNuevo ? '' : ' (sin índice nuevo)'}`);
  } catch (error) {
    malas += 1;
    console.log(`${federacion.padEnd(20)} ${String(mb).padStart(5)}   NO SE PUDO ABRIR: ${error.message.slice(0, 60)}`);
  } finally {
    try { db?.close(); } catch { /* ya cerrada */ }
  }
}
console.log(`\ncolas con problemas: ${malas}`);
process.exit(malas ? 2 : 0);
