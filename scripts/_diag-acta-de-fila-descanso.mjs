#!/usr/bin/env node
/**
 * SÓLO LECTURA: en las filas de descanso con acta, ¿el acta describe un partido REAL?
 *
 * Es la pregunta que separa «fila fantasma» de «partido desplazado» en Madrid y Valencia, que son 4.072 de
 * los 5.683 casos y todos llevan acta. Si el acta nombra una pareja real de equipos, la cola emparejó a un
 * equipo real con el descanso y el partido verdadero está en otra fila o falta: eso es un desplazamiento.
 * Si el acta es un identificador interno sin pareja, la fila es simplemente el bloque de descanso.
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');

for (const federacion of ['madrid', 'valencia', 'euskadi']) {
  const p = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) continue;
  const db = new DatabaseSync(p, { readOnly: true });
  const filas = db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, local, visitante
    from partidos
    where (lower(trim(local)) like 'descans%' or lower(trim(visitante)) like 'descans%'
        or lower(trim(local)) like 'atsedena%' or lower(trim(visitante)) like 'atsedena%')
      and codigo_acta is not null
    limit 8`).all();
  console.log(`\n=== ${federacion}: ${filas.length} filas de descanso CON acta (muestra) ===`);
  let conParejaReal = 0;
  let sinPareja = 0;
  let ilegible = 0;
  for (const f of filas) {
    const a = db.prepare('select datos, estado from actas where codigo=? and temporada=? and competicion=? and grupo=?')
      .get(f.codigo_acta, f.temporada, f.competicion, f.grupo);
    let d = null;
    try { d = a?.datos ? JSON.parse(a.datos) : null; } catch { d = undefined; }
    const pareja = d?.local && d?.visitante ? `${d.local} / ${d.visitante}` : null;
    if (d === undefined) ilegible += 1; else if (pareja) conParejaReal += 1; else sinPareja += 1;
    // ¿Esa pareja del acta existe en la cola de la misma jornada, como fila propia?
    let enLaCola = false;
    if (pareja) {
      enLaCola = db.prepare(`select count(*) n from partidos where temporada=? and competicion=? and grupo=? and jornada=?
        and local=? and visitante=?`).get(f.temporada, f.competicion, f.grupo, f.jornada, d.local, d.visitante).n > 0;
    }
    console.log(`  t${f.temporada} g${f.grupo} J${f.jornada} ord ${f.orden} · acta ${f.codigo_acta} (estado ${a?.estado ?? '?'})`);
    console.log(`      cola:  «${f.local}» vs «${f.visitante}»`);
    console.log(`      acta:  ${pareja ? `«${pareja}»` : '(sin pareja legible)'}${pareja ? ` · ¿esa pareja tiene su propia fila en la cola? ${enLaCola ? 'SÍ' : 'NO'}` : ''}`);
  }
  console.log(`  resumen de la muestra: con pareja real ${conParejaReal} · sin pareja ${sinPareja} · datos ilegibles ${ilegible}`);
  db.close();
}
