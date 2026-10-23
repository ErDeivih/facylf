/*
 * Verificación del canónico para el buscador de informes.
 *
 * Contesta a tres cosas que hay que saber ANTES de escribir la página:
 *   1. las columnas reales de las tablas implicadas (no las que uno supone);
 *   2. qué federaciones y temporadas tiene ESTE canónico, porque un informe sólo puede salir de datos que estén aquí;
 *   3. cuántas competiciones están completas (`visibility_state='completa'`) y cuántas no, que es la regla que decide
 *      si una temporada terminada entra en el informe.
 */
import { readFileSync } from 'node:fs';
import pg from 'pg';
const env = Object.fromEntries(readFileSync(new URL('../../.env', import.meta.url), 'utf8')
  .split(/\r?\n/).filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const c = new pg.Client({ connectionString: env.DATABASE_URL_LECTOR });
await c.connect();

console.log('=== COLUMNAS REALES DE LAS TABLAS DEL BUSCADOR ===');
for (const tabla of ['club', 'team_season', 'team_entry', 'phase_group', 'competition_edition', 'season', 'federation']) {
  const r = await c.query(`select column_name, data_type from information_schema.columns
    where table_schema='core' and table_name=$1 order by ordinal_position`, [tabla]);
  console.log(`  ${tabla}: ${r.rows.map((x) => x.column_name).join(', ')}`);
}

console.log('\n=== QUÉ TIENE ESTE CANÓNICO ===');
const fed = await c.query(`select f.codigo, count(distinct ce.id) as ediciones
  from core.federation f left join core.competition_edition ce on ce.federation_id = f.id
  group by 1 order by 2 desc`);
for (const f of fed.rows) console.log(`  ${String(f.codigo).padEnd(20)} ${String(f.ediciones).padStart(6)} ediciones`);

const temp = await c.query(`select s.etiqueta, count(distinct ce.id) as ediciones,
    count(distinct ce.id) filter (where ce.visibility_state = 'completa') as completas
  from core.season s left join core.competition_edition ce on ce.season_id = s.id
  group by 1, s.orden order by s.orden desc`);
console.log('\n  temporada   ediciones   completas');
for (const t of temp.rows) {
  console.log(`  ${String(t.etiqueta).padEnd(11)} ${String(t.ediciones).padStart(9)} ${String(t.completas).padStart(11)}`);
}

console.log('\n=== UNA BÚSQUEDA DE PRUEBA: clubes que contengan "pizarrales" ===');
const bus = await c.query(`select te.id as inscripcion, cl.nombre_canonico as club, ts.nombre as equipo,
    ce.categoria, ce.nombre_publicado as competicion, pg.nombre as grupo, s.etiqueta as temporada,
    ce.visibility_state, f.codigo as federacion,
    (select count(*) from core.match m where m.phase_group_id = pg.id) as partidos
  from core.team_entry te
  join core.team_season ts on ts.id = te.team_season_id
  join core.club cl on cl.id = ts.club_id
  join core.phase_group pg on pg.id = te.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id
  join core.season s on s.id = ce.season_id
  join core.federation f on f.id = ce.federation_id
  where cl.nombre_canonico ilike '%pizarrales%' or cl.nombre_norm like '%pizarrales%'
  order by s.orden desc, ce.categoria limit 12`);
for (const b of bus.rows) {
  console.log(`  ${String(b.inscripcion).padStart(6)} ${String(b.temporada).padEnd(9)} ${String(b.categoria).padEnd(12)} ${String(b.competicion).slice(0, 34).padEnd(36)} ${String(b.grupo).slice(0, 18).padEnd(20)} ${b.visibility_state} (${b.partidos} partidos)`);
}
console.log(`  ${bus.rows.length} resultados`);

console.log('\n=== ¿CUÁNTAS INSCRIPCIONES HAY EN TOTAL? (para saber si el buscador debe paginar) ===');
const tot = await c.query(`select count(*) as n from core.team_entry`);
console.log(`  ${tot.rows[0].n} inscripciones`);
await c.end();
