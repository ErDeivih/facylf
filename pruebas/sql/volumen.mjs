// Banco de VOLUMEN: crea una base PGlite persistente con datos inventados a escala (3 federaciones,
// 2 temporadas, ~33.000 partidos, ~800.000 apariciones) y la proyecta como el proyector real.
//   node pruebas/sql/volumen.mjs [carpeta] [equipos_por_grupo=14]
// Luego: node pruebas/sql/rendimiento.mjs [carpeta]  → EXPLAIN ANALYZE de todas las consultas de la web.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = process.argv[2] ?? '/tmp/facylf-volumen';
const N = Number(process.argv[3] ?? 14);
if (existsSync(DIR)) rmSync(DIR, { recursive: true });
for (const ev of ['unhandledRejection', 'uncaughtException']) process.on(ev, (e) => { console.error('✗', e.message, e.detail ?? '', e.where ?? ''); process.exit(1); });
const db = new PGlite({ dataDir: DIR, extensions: { pg_trgm, unaccent } });
const t0 = Date.now(); const paso = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)} s] ${m}`);
const mig = join(RAIZ, 'infra', 'migraciones');
for (const f of readdirSync(mig).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(mig, f), 'utf8').replace(/create extension if not exists pg_stat_statements;/, ''));
}
paso('migraciones aplicadas');

await db.exec(`
insert into core.federation (codigo, nombre, adaptador) values ('f1','Federación Uno','pnfg'),('f2','Federación Dos','pnfg'),('f3','Federación Tres','fcf');
insert into core.season (etiqueta, anio_inicio, orden) values ('2024-25',2024,24),('2025-26',2025,25);
create temp table _cat (n int, categoria text, division text, modalidad text, genero text, ambito text, nivel int);
insert into _cat values
 (1,'aficionados','tercera-federacion','futbol11','masculina','nacional',1),(2,'aficionados','preferente','futbol11','masculina','regional',2),
 (3,'aficionados','primera','futbol11','masculina','provincial',3),(4,'juvenil','division-honor','futbol11','masculina','nacional',1),
 (5,'juvenil','liga-nacional','futbol11','masculina','nacional',2),(6,'juvenil','primera','futbol11','masculina','provincial',3),
 (7,'cadete','division-honor-regional','futbol11','masculina','regional',1),(8,'cadete','primera','futbol11','masculina','provincial',2),
 (9,'infantil','preferente','futbol11','masculina','regional',1),(10,'infantil','primera','futbol11','masculina','provincial',2),
 (11,'alevin','primera','futbol7','masculina','provincial',1),(12,'alevin','segunda','futbol8','masculina','provincial',2),
 (13,'benjamin','primera','futbol8','masculina','provincial',1),(14,'aficionados','primera-federacion','futbol11','femenina','nacional',1),
 (15,'veteranos','primera','futbol11','masculina','provincial',1);
insert into core.competition_edition (federation_id, season_id, codigo_externo, nombre_publicado, categoria, division, modalidad, genero, ambito, nivel)
  select f.id, s.id, 'C'||c.n, initcap(c.categoria)||' '||c.division, c.categoria, c.division, c.modalidad, c.genero, c.ambito, c.nivel
    from core.federation f, core.season s, _cat c;
insert into core.phase_group (competition_edition_id, codigo_externo, nombre) select ce.id, 'G'||g, 'Grupo '||g from core.competition_edition ce, generate_series(1,2) g;
insert into core.matchday (phase_group_id, numero) select pg.id, n from core.phase_group pg, generate_series(1, ${2 * (N - 1)}) n;
insert into core.club (federation_id, nombre_canonico, provincia) select f.id, 'Club '||f.codigo||'-'||i, 'Provincia '||(i % 4) from core.federation f, generate_series(1,120) i;
insert into core.person (nombre_mostrado, es_menor) select 'Árbitro '||i||' Pérez', false from generate_series(1, 300) i;
create temp table _eq as
  select pg.id pg, ce.federation_id fed, ce.season_id se, ce.categoria, s.slot,
         row_number() over (partition by ce.federation_id, ce.season_id order by pg.id, s.slot) k
    from core.phase_group pg join core.competition_edition ce on ce.id = pg.competition_edition_id, generate_series(1, ${N}) s(slot);
alter table _eq add column club bigint, add column ts bigint, add column te bigint;
update _eq e set club = (select min(c.id) from core.club c where c.federation_id = e.fed) + ((e.k * 37) % 120);
insert into core.team_season (club_id, season_id, nombre, categoria)
  select club, se, 'Club '||club||' '||categoria||' #'||k, categoria from _eq;
update _eq e set ts = t.id from core.team_season t where t.season_id = e.se and t.nombre = 'Club '||e.club||' '||e.categoria||' #'||e.k;
insert into core.team_entry (team_season_id, phase_group_id, codigo_externo, nombre_en_fuente)
  select ts, pg, 'E'||ts, 'Club '||club||' #'||k from _eq;
update _eq e set te = t.id from core.team_entry t where t.team_season_id = e.ts;
create index on _eq (pg, slot); create index on _eq (te);
`);
paso('catálogo, clubes y equipos');

// Plantillas: 20 por equipo. En la 2.ª temporada los 14 primeros son los mismos (misma k) → trayectorias.
await db.exec(`
create temp table _pl as select e.te, e.k, e.fed, e.se, p, case when e.se = 2 and p <= 14 then 1 else e.se end as se_origen from _eq e, generate_series(1,20) p;
alter table _pl add column person bigint;
create temp table _per as select distinct fed, k, p, se_origen from _pl;
alter table _per add column id bigint;
insert into core.person (nombre_mostrado, es_menor)
  select 'Jugador '||fed||'-'||k||'-'||p||'-'||se_origen, (k % 3 <> 0) from _per order by fed, k, p, se_origen;
update _per x set id = pe.id from core.person pe where pe.nombre_mostrado = 'Jugador '||x.fed||'-'||x.k||'-'||x.p||'-'||x.se_origen;
update _pl l set person = x.id from _per x where x.fed = l.fed and x.k = l.k and x.p = l.p and x.se_origen = l.se_origen;
create index on _pl (te, p);
`);
paso('personas');

// Partidos: todos contra todos a doble vuelta. Temporada 2025-26: jugadas las 8 primeras jornadas.
await db.exec(`
insert into core.match (phase_group_id, matchday_id, source_order, home_team_entry_id, away_team_entry_id, goles_local, goles_visitante, official_status, played_at)
select a.pg, md.id, a.slot, a.te, b.te,
       case when jugado then (a.te * 7 + b.te) % 4 end, case when jugado then (a.te + b.te * 3) % 3 end,
       case when jugado then 'played' else 'scheduled' end,
       (date '2024-09-07' + 365 * (a.se - 1) + 7 * (md.numero - 1))::timestamptz + interval '11 hours'
  from _eq a join _eq b on b.pg = a.pg and b.slot <> a.slot
  cross join lateral (select ((a.slot + b.slot) % ${N - 1}) + 1 + case when a.slot < b.slot then 0 else ${N - 1} end as num) j
  join core.matchday md on md.phase_group_id = a.pg and md.numero = j.num
  cross join lateral (select (a.se = 1 or j.num <= 8) as jugado) x;
`);
paso(`partidos: ${(await db.query('select count(*) n from core.match')).rows[0].n}`);

await db.exec(`
insert into core.appearance (match_id, person_id, team_entry_id, season_id, lado, condition, dorsal, portero, orden)
select m.id, l.person, l.te, s.se, s0.lado, case when r.ord <= 11 then 'starter' else 'substitute' end, r.ord, r.ord = 1, r.ord
  from core.match m
  cross join lateral (values (m.home_team_entry_id, 'local'), (m.away_team_entry_id, 'visitante')) s0(te, lado)
  join _eq s on s.te = s0.te
  cross join lateral generate_series(1, 16) r(ord)
  join _pl l on l.te = s.te and l.p = ((r.ord + m.matchday_id) % 20) + 1
 where m.official_status = 'played';
`);
paso(`apariciones: ${(await db.query('select count(*) n from core.appearance')).rows[0].n}`);

await db.exec(`
insert into core.match_event (match_id, person_id, team_entry_id, event_type, subtipo, minute_base, lado, source_order, sujeto_tipo)
select a.match_id, a.person_id, a.team_entry_id, ev.t, case when ev.t = 'gol' then 'normal' end, ev.m, a.lado, (case a.lado when 'local' then 0 else 500 end + a.orden * 10 + ev.n)::smallint, 'jugador'
  from core.appearance a join core.match m on m.id = a.match_id
  join core.competition_edition ce on ce.id = (select competition_edition_id from core.phase_group where id = m.phase_group_id)
  cross join lateral (values
     (1, 'sale', 60 + a.orden, a.orden in (10, 11)),
     (2, 'entra', 60 + a.orden - 2, a.orden in (12, 13)),
     (3, 'gol', 10 + (a.id % 80)::int, a.orden between 7 and 11 and (a.id % 5 = 0)),
     (4, 'tarjeta_amarilla', 20 + (a.id % 70)::int, a.id % 9 = 0),
     (5, 'tarjeta_roja', 80, a.id % 211 = 0)) ev(n, t, m, si)
 where ev.si and not (ce.federation_id = 3 and ev.t in ('sale','entra','tarjeta_amarilla','tarjeta_roja'));
insert into core.match_official (match_id, person_id, rol) select m.id, 1 + (m.id % 300), 'principal' from core.match m where m.official_status = 'played';
insert into core.match_report (match_id, quality, parser_version) select id, 'correct', 1 from core.match where official_status = 'played';
insert into ops.coverage_checkpoint (phase_group_id) select id from core.phase_group;
`);
paso(`eventos: ${(await db.query('select count(*) n from core.match_event')).rows[0].n} (la federación 3 sin cambios ni tarjetas, como Cataluña)`);
await db.exec('analyze');

const q = async (s, p) => (await db.query(s, p)).rows;
const grupos = await q('select id, competition_edition_id e from core.phase_group order by id');
const ediciones = [...new Set(grupos.map((g) => Number(g.e)))];
for (const e of ediciones) await q('select analytics.recalcula_capacidad_edicion($1)', [e]);
const personas = new Set();
let i = 0;
for (const g of grupos) {
  await db.exec('begin');
  const [{ r }] = await q('select analytics.proyecta_grupo($1) as r', [g.id]);
  await q('select analytics.proyecta_busqueda_grupo($1)', [g.id]);
  await q('select analytics.proyecta_tramos_grupo($1)', [g.id]);
  const ps = (r.personas ?? []).map(Number);
  if (ps.length) {
    await q('select analytics.proyecta_carreras($1::bigint[])', [ps]);
    await q('select analytics.proyecta_busqueda_personas($1::bigint[])', [ps]);
    await q('select analytics.proyecta_perfiles($1::bigint[])', [ps]);
  }
  await db.exec('commit');
  ps.forEach((p) => personas.add(p));
  if (++i % 30 === 0) paso(`proyectados ${i}/${grupos.length} grupos`);
}
for (const e of ediciones) await q('select analytics.proyecta_sanciones_edicion($1)', [e]);
const lista = [...personas];
for (let j = 0; j < lista.length; j += 2000) await q('select analytics.proyecta_temporadas($1::bigint[])', [lista.slice(j, j + 2000)]);
await q('select analytics.recalcula_arbitros()');
await q('select analytics.recalcula_frecuencias()');
await q('select analytics.recalcula_evolucion()');
await q('select analytics.recalcula_zonas()');
for (const e of ediciones) await q('select ops.detecta_casos($1)', [e]);
await db.exec('analyze');
paso('proyección completa');
for (const t of ['core.match', 'core.appearance', 'core.match_event', 'core.person', 'analytics.player_team_season_summary', 'analytics.jugador_temporada', 'analytics.search_entity', 'analytics.team_edition_summary'])
  console.log(`  ${t}: ${(await q(`select count(*)::int n from ${t}`))[0].n}`);
await db.close();
