/*
 * Qué filas de la cola tienen un lado EXACTAMENTE en el vocabulario de descanso, ahora mismo.
 *
 * Es una comprobación de estado, no de código: sirve para responder «¿queda alguna fila de descanso en la
 * cola?» sin depender del informe, y para ver a qué jornada pertenece cada una. Sólo lee.
 *
 * Uso: node scripts/_diag-descanso-cola.mjs [federacion…]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const vocabulario = new Set(['descansa', 'descans', 'atsedena']);

const federaciones = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!federaciones.length) federaciones.push('euskadi');

for (const federacion of federaciones) {
  const carpeta = federacion === 'castilla-leon' ? 'descargas-federacion' : `descargas-${federacion}`;
  const ruta = join(raiz, carpeta, 'recolector-local', 'cola-v2.sqlite');
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
  } catch (error) {
    console.log(`${federacion}: no se pudo abrir ${ruta} (${error.message})`);
    continue;
  }
  const filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, local, visitante, codigo_acta
    from partidos`).all();
  db.close();
  const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const conDescanso = filas.filter((f) => vocabulario.has(norm(f.local)) || vocabulario.has(norm(f.visitante)));
  console.log(`${federacion}: ${filas.length} filas · con un lado de descanso: ${conDescanso.length}`);
  for (const f of conDescanso) {
    console.log(`  t${f.temporada} c${f.competicion} g${f.grupo} J${f.jornada} ord ${f.orden}: `
      + `«${f.local}» vs «${f.visitante}» · acta ${f.codigo_acta ?? '(sin acta)'}`);
  }
}
