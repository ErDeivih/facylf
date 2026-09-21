#!/usr/bin/env node
/**
 * SÓLO LECTURA: el descanso en los adaptadores iSquad (Madrid, Valencia), donde SÍ está dado de alta.
 *
 * Madrid y Valencia tienen en su catálogo equipos llamados exactamente «Descansa», y todos con **código
 * negativo** (`-1`, `-9872`…). Eso cambia la regla: en estos adaptadores el descanso NO es un nombre que
 * aparezca suelto, es una entidad sintética con código, y el código es la evidencia.
 *
 * Uso: npx tsx scripts/_diag-descanso-isquad.mjs
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');
const raiz = resolve(import.meta.dirname, '..');

for (const federacion of ['madrid', 'valencia']) {
  const p = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  if (!existsSync(p)) { console.log(`${federacion}: sin cola`); continue; }
  const db = new DatabaseSync(p, { readOnly: true });
  console.log(`\n=== ${federacion} ===`);
  const cat = db.prepare(`select count(*) total,
      sum(case when codigo like '-%' then 1 else 0 end) negativos
    from equipos where lower(trim(nombre)) in ('descansa','descans','atsedena','reposa')`).get();
  console.log(`  catálogo: ${cat.total} equipos de descanso · ${cat.negativos} con código negativo`);

  const filas = db.prepare(`select
      sum(case when lower(trim(local)) like 'descans%' or lower(trim(visitante)) like 'descans%' then 1 else 0 end) filas_descanso,
      sum(case when (lower(trim(local)) like 'descans%' and equipo_local_codigo like '-%')
                 or (lower(trim(visitante)) like 'descans%' and equipo_visitante_codigo like '-%') then 1 else 0 end) descanso_con_codigo_negativo,
      sum(case when (lower(trim(local)) like 'descans%' and equipo_local_codigo is null)
                 or (lower(trim(visitante)) like 'descans%' and equipo_visitante_codigo is null) then 1 else 0 end) descanso_sin_codigo,
      sum(case when (lower(trim(local)) like 'descans%' and equipo_local_codigo is not null and equipo_local_codigo not like '-%')
                 or (lower(trim(visitante)) like 'descans%' and equipo_visitante_codigo is not null and equipo_visitante_codigo not like '-%') then 1 else 0 end) descanso_con_codigo_positivo
    from partidos`).get();
  console.log(`  partidos con «Descansa» en un lado: ${filas.filas_descanso}`);
  console.log(`    de ellos con código NEGATIVO en ese lado: ${filas.descanso_con_codigo_negativo}`);
  console.log(`    con código positivo: ${filas.descanso_con_codigo_positivo} · sin código: ${filas.descanso_sin_codigo}`);

  console.log('  muestra:');
  for (const f of db.prepare(`select temporada, competicion, grupo, jornada, orden, codigo_acta, equipo_local_codigo cl,
      equipo_visitante_codigo cv, local, visitante, goles_local gl, goles_visitante gv, campo, arbitro
    from partidos where lower(trim(local)) like 'descans%' or lower(trim(visitante)) like 'descans%'
    limit 6`).all()) {
    console.log(`    t${f.temporada} g${f.grupo} J${f.jornada} ord ${f.orden} · acta ${f.codigo_acta ?? 'NULL'} · códigos ${f.cl ?? '-'}/${f.cv ?? '-'}`);
    console.log(`        «${f.local}» vs «${f.visitante}» · ${f.gl ?? 'NULL'}-${f.gv ?? 'NULL'} · campo ${JSON.stringify(f.campo)} · árbitro ${JSON.stringify(f.arbitro)}`);
  }
  // ¿Cuántos códigos negativos hay en total? Si son muchos y no todos son descanso, el negativo no basta
  // como señal por sí solo.
  const negativos = db.prepare(`select count(*) n from partidos
    where equipo_local_codigo like '-%' or equipo_visitante_codigo like '-%'`).get().n;
  const negativosNoDescanso = db.prepare(`select count(*) n from partidos
    where (equipo_local_codigo like '-%' and lower(trim(local)) not like 'descans%')
       or (equipo_visitante_codigo like '-%' and lower(trim(visitante)) not like 'descans%')`).get().n;
  console.log(`  partidos con algún código negativo: ${negativos} · de ellos sin «Descansa» en el lado negativo: ${negativosNoDescanso}`);
  db.close();
}
