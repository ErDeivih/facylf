/*
 * Estado de una cola de maqueta isquad (Madrid y Valencia): cuántas filas, con qué códigos y cuántos
 * bloques de descanso quedan. Sólo lee.
 *
 * Uso: node scripts/_diag-cola-isquad.mjs [madrid valencia]
 */
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const requerir = createRequire(import.meta.url);
const { DatabaseSync } = requerir('node:sqlite');

const raiz = resolve(process.env.FACYLF_RAIZ ?? '.');
const federaciones = process.argv.slice(2).length ? process.argv.slice(2) : ['madrid', 'valencia'];

for (const federacion of federaciones) {
  const ruta = join(raiz, `descargas-${federacion}`, 'recolector-local', 'cola-v2.sqlite');
  let db;
  try {
    db = new DatabaseSync(ruta, { readOnly: true });
  } catch (error) {
    console.log(`${federacion}: ${error.message}`);
    continue;
  }
  const uno = (sql) => db.prepare(sql).get().n;
  console.log(`\n=== ${federacion}`);
  console.log(`  filas en partidos ................ ${uno('select count(*) n from partidos')}`);
  console.log(`  con los dos códigos .............. ${uno('select count(*) n from partidos where equipo_local_codigo is not null and equipo_visitante_codigo is not null')}`);
  console.log(`  sin ningún código ................ ${uno('select count(*) n from partidos where equipo_local_codigo is null and equipo_visitante_codigo is null')}`);
  console.log(`  con ALGÚN código NEGATIVO ........ ${uno("select count(*) n from partidos where equipo_local_codigo like '-%' or equipo_visitante_codigo like '-%'")}`);
  console.log(`  con un lado en el vocabulario .... ${uno("select count(*) n from partidos where lower(trim(local)) in ('descansa','descans','descanso') or lower(trim(visitante)) in ('descansa','descans','descanso')")}`);
  console.log(`  con negativo Y vocabulario ....... ${uno("select count(*) n from partidos where (equipo_local_codigo like '-%' or equipo_visitante_codigo like '-%') and (lower(trim(local)) in ('descansa','descans','descanso') or lower(trim(visitante)) in ('descansa','descans','descanso'))")}`);
  console.log(`  con negativo SIN vocabulario ..... ${uno("select count(*) n from partidos where (equipo_local_codigo like '-%' or equipo_visitante_codigo like '-%') and not (lower(trim(local)) in ('descansa','descans','descanso') or lower(trim(visitante)) in ('descansa','descans','descanso'))")}`);
  console.log(`  jornadas con archivo ............. ${uno('select count(*) n from jornadas where archivo is not null')}`);
  console.log(`  grupos ........................... ${uno('select count(distinct grupo) n from partidos')}`);
  console.log(`  temporadas ....................... ${db.prepare('select temporada, count(*) n from partidos group by temporada order by temporada').all().map((t) => `${t.temporada}:${t.n}`).join(' ')}`);
  const ejemplos = db.prepare(`select local, visitante, equipo_local_codigo cl, equipo_visitante_codigo cv, orden
    from partidos where equipo_local_codigo like '-%' or equipo_visitante_codigo like '-%' limit 5`).all();
  for (const e of ejemplos) console.log(`  · «${e.local}» (${e.cl ?? '-'}) vs «${e.visitante}» (${e.cv ?? '-'}) ord ${e.orden}`);
  const archivos = db.prepare(`select archivo from jornadas where archivo is not null limit 2`).all().map((a) => a.archivo);
  for (const a of archivos) console.log(`  archivo: ${a}`);
  db.close();
}
