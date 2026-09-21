/* Enlaza en la base las actas cuyo HTML está en disco pero cuya fila no tiene `archivo`.
 *
 * Ocurre con las actas archivadas por la guarda de "acta ilegible": el fichero se guarda en disco,
 * pero la fila se quedaba sin `archivo`, y `recolector:reprocesar` busca por esa columna. Sin este
 * enlace, esas páginas no se podían recuperar sin volver a pedirlas.
 *
 * Uso: node scripts/_diag-enlazar-actas.mjs <ruta-cola.sqlite> [--aplicar]
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ruta = process.argv[2];
const aplicar = process.argv.includes('--aplicar');
if (!ruta) { console.error('Falta la ruta de la cola.'); process.exit(2); }

const carpeta = join(ruta, '..');
const db = new DatabaseSync(ruta);
const pendientes = db.prepare(`
  select codigo, temporada, competicion, grupo, jornada, menores
  from actas where archivo is null and estado <> 'hecha'
`).all();

let encontradas = 0;
const cambios = [];
for (const a of pendientes) {
  const sub = a.menores ? 'actas-menores' : 'actas-adultos';
  const archivo = join(carpeta, `t${a.temporada}-${etiqueta(a.temporada)}`,
    `comp-${a.competicion}`, `grupo-${a.grupo}`, sub, `acta-${a.codigo}.html`);
  if (!existsSync(archivo)) continue;
  encontradas += 1;
  cambios.push({ ...a, archivo });
}

console.log(`${ruta}`);
console.log(`actas sin enlace: ${pendientes.length} · con HTML ya en disco: ${encontradas}`);

if (encontradas && aplicar) {
  db.exec('begin immediate');
  for (const c of cambios) {
    const hash = createHash('sha256').update(readFileSync(c.archivo)).digest('hex');
    db.prepare(`update actas set archivo=?,hash=?,comprobada_en=? where temporada=? and competicion=?
      and grupo=? and jornada=? and codigo=?`)
      .run(c.archivo, hash, new Date().toISOString(), c.temporada, c.competicion, c.grupo, c.jornada, c.codigo);
  }
  db.exec('commit');
  console.log(`enlazadas: ${cambios.length}`);
} else if (encontradas) {
  console.log('(modo consulta: añade --aplicar para enlazarlas)');
}
db.close();

function etiqueta(codigo) {
  const inicio = 2004 + Number(codigo);
  return `${inicio}-${String(inicio + 1).slice(-2)}`;
}
