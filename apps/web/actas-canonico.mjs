// Actas de CyL por temporada en el canónico del PC (se ejecuta desde apps/web, que tiene pg).
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = readFileSync('F:/Proyectos/facylf/.env', 'utf8');
const url = env.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL_MIGRACION=')).split('=').slice(1).join('=').trim();
const c = new pg.Client({ connectionString: url });
await c.connect();

const { rows } = await c.query(`
  select s.etiqueta as temporada,
         count(*)::int as partidos,
         count(*) filter (where m.goles_local is not null)::int as con_resultado,
         count(*) filter (where exists (select 1 from core.match_report r where r.match_id = m.id))::int as con_acta,
         count(*) filter (where m.goles_local is not null
                            and not exists (select 1 from core.match_report r where r.match_id = m.id))::int as faltan_acta
    from core.match m
    join core.phase_group g on g.id = m.phase_group_id
    join core.competition_edition e on e.id = g.competition_edition_id
    join core.season s on s.id = e.season_id
    join core.federation f on f.id = e.federation_id
   where f.nombre ilike '%castilla%' and s.etiqueta >= '2019-20'
   group by 1 order by 1`);
console.log('temporada | partidos | con_resultado | con_acta | faltan_acta');
for (const r of rows) console.log(`${r.temporada} | ${r.partidos} | ${r.con_resultado} | ${r.con_acta} | ${r.faltan_acta}`);
console.log('TOTAL faltan actas (2019-20 en adelante):', rows.reduce((a, r) => a + Number(r.faltan_acta), 0));

const g = await c.query(`
  select s.etiqueta temporada, count(distinct e.id)::int competiciones, count(distinct g.id)::int grupos
    from core.phase_group g
    join core.competition_edition e on e.id = g.competition_edition_id
    join core.season s on s.id = e.season_id
    join core.federation f on f.id = e.federation_id
   where f.nombre ilike '%castilla%' and s.etiqueta >= '2019-20'
   group by 1 order by 1`);
console.log('\ntemporada | competiciones | grupos');
for (const r of g.rows) console.log(`${r.temporada} | ${r.competiciones} | ${r.grupos}`);
await c.end();
