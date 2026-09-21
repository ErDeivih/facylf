/*
 * Las filas de UNA jornada de la cola, tal y como están ahora.
 *
 * Sirve para comprobar el efecto de un lote sobre la cola real sin abrir la herramienta entera, y para ver si
 * el worker ha vuelto a escribir lo que el lote corrigió —que es la pregunta de la reaparición—.
 *
 * Uso: node scripts/_diag-jornada-cola.mjs euskadi 22 24622157 24622363 1
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const [federacion = 'euskadi', temporada, competicion, grupo, jornada] = process.argv.slice(2);
const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
const db = new DatabaseSync(join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite'), { readOnly: true });

console.log(`partidos en la cola de ${federacion}: ${db.prepare('select count(*) n from partidos').get().n}`);
const filas = db.prepare(`select orden, codigo_acta, local, visitante, equipo_local_codigo cl, equipo_visitante_codigo cv,
    actualizado_en from partidos where temporada=? and competicion=? and grupo=? and jornada=? order by orden`)
  .all(temporada, competicion, grupo, jornada);
console.log(`jornada ${temporada}/${competicion}/${grupo}/${jornada}: ${filas.length} filas`);
for (const f of filas) {
  console.log(`  ord ${f.orden}: «${f.local}» vs «${f.visitante}» · acta ${f.codigo_acta ?? '(sin acta)'}`
    + ` · códigos ${f.cl ?? '-'}/${f.cv ?? '-'} · actualizado ${f.actualizado_en}`);
}
const j = db.prepare(`select archivo, hash, comprobada_en from jornadas where temporada=? and competicion=? and grupo=? and numero=?`)
  .get(temporada, competicion, grupo, jornada);
console.log(`jornada en la cola: comprobada_en ${j?.comprobada_en ?? '(sin sello)'} · hash ${String(j?.hash ?? '').slice(0, 16)}…`);
db.close();
