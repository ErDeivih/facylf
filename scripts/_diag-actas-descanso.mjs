/*
 * ¿POR QUÉ no se pueden retirar las filas de descanso de Madrid y Valencia? Estado de sus actas.
 *
 * La retirada exige PRUEBA: o no hay acta, o el acta nombra el descanso. Estas dos colas tienen acta en todas
 * sus filas de descanso, así que la pregunta es qué dice esa acta y si merece la pena volver a pedirla:
 *
 *   · `sin fila`      → la fila trae código de acta pero la tabla `actas` no tiene esa acta: falta pedirla;
 *   · `pendiente`     → está encolada y NO descargada todavía: la recolección la traerá;
 *   · `hecha` vacía   → se descargó y vino SIN pareja (`{"local":"","visitante":""}`): pedirla otra vez no
 *                       arregla nada por sí solo;
 *   · `hecha` con pareja → tiene los dos lados: se puede decidir con ella.
 *
 * Sólo lee. Uso: node scripts/_diag-actas-descanso.mjs [madrid valencia]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federaciones = process.argv.slice(2).length ? process.argv.slice(2) : ['madrid', 'valencia'];
const VOCABULARIO = ['descansa', 'descans', 'descanso', 'atsedena'];

const norm = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/\([^)]*\)/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

for (const federacion of federaciones) {
  const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  let db;
  try { db = new DatabaseSync(ruta, { readOnly: true }); } catch { console.log(`${federacion}: sin cola`); continue; }
  const hayActas = db.prepare("select count(*) n from sqlite_master where type='table' and name='actas'").get().n > 0;
  if (!hayActas) { console.log(`${federacion}: no hay tabla de actas`); db.close(); continue; }

  const bloques = db.prepare('select local, visitante, codigo_acta, jornada from partidos').all()
    .filter((f) => VOCABULARIO.includes(norm(f.local)) || VOCABULARIO.includes(norm(f.visitante)));
  const leerActa = db.prepare('select estado, datos, calidad from actas where codigo=?');

  const cuenta = new Map();
  const ejemplos = [];
  for (const b of bloques) {
    let clase;
    if (!b.codigo_acta) clase = 'sin código de acta en la fila';
    else {
      const acta = leerActa.get(String(b.codigo_acta));
      if (!acta) clase = 'sin fila de acta en la cola';
      else {
        let datos = null;
        try { datos = JSON.parse(acta.datos ?? '{}'); } catch { datos = null; }
        const pareja = datos?.local && datos?.visitante ? [String(datos.local), String(datos.visitante)] : null;
        if (pareja) clase = `con pareja (${acta.estado})`;
        else clase = `SIN pareja (${acta.estado}${acta.calidad ? `, ${acta.calidad}` : ''})`;
      }
    }
    cuenta.set(clase, (cuenta.get(clase) ?? 0) + 1);
    if (ejemplos.length < 4) ejemplos.push(`${b.local || '(sin nombre)'} vs ${b.visitante || '(sin nombre)'} · acta ${b.codigo_acta ?? '—'} → ${clase}`);
  }
  console.log(`\n=== ${federacion}: ${bloques.length} filas de descanso`);
  for (const [clase, n] of [...cuenta.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${clase}`);
  }
  for (const e of ejemplos) console.log(`     · ${e}`);
  const estados = db.prepare('select estado, count(*) n from actas group by estado order by n desc').all();
  console.log(`  actas de la cola por estado: ${estados.map((e) => `${e.estado}=${e.n}`).join(' · ')}`);
  db.close();
}
