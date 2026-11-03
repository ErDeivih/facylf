import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { unaccent } from '@electric-sql/pglite/contrib/unaccent';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Pruebas de las migraciones 0029 sobre un PostgreSQL embebido (PGlite), sin tocar ninguna base real.
// Instalar una vez en una carpeta aparte: npm i @electric-sql/pglite@0.5 ; ejecutar: node pruebas/sql/m29.mjs
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dirs = (process.env.FACYLF_MIGRACIONES ?? join(RAIZ, 'infra', 'migraciones')).split(',');
export async function base29() {
  const db = new PGlite({ extensions: { pg_trgm, unaccent } });
  const fs = [];
  for (const d of dirs) for (const f of readdirSync(d).filter(f => f.endsWith('.sql'))) fs.push([f, `${d}/${f}`]);
  const vistos = new Set();
  for (const [f, p] of fs.sort((a, b) => a[0].localeCompare(b[0]))) {
    if (vistos.has(f)) continue; vistos.add(f);
    const sql = readFileSync(p, 'utf8').replace(/create extension if not exists pg_stat_statements;/, '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${f}: ${e.message}`); }
  }
  return db;
}
let fallos = 0;
export function ok(c, msg, extra) { if (!c) { fallos++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('  ✓', msg); }
export function fin() { console.log(fallos ? `${fallos} FALLOS` : 'TODO OK'); process.exitCode = fallos ? 1 : 0; }

// En Windows `file://${argv[1]}` nunca coincide (barras y letra de unidad): se compara con la URL bien formada.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = await base29();
  const q = async (s, p) => (await db.query(s, p)).rows;
  const mp = async (c, ev, d) => (await q('select analytics.minutos_partido($1,$2::jsonb,$3) m', [c, JSON.stringify(ev), d]))[0].m;

  console.log('1 · minutos_partido');
  ok(await mp('starter', [], 90) === 90, 'titular sin eventos = 90');
  ok(await mp('substitute', [], 90) === 0, 'suplente sin entrar = 0');
  ok(await mp('starter', [{ t: 'sale', m: 60 }], 90) === 60, 'titular sale 60 = 60');
  ok(await mp('substitute', [{ t: 'entra', m: 60 }], 90) === 30, 'suplente entra 60 = 30');
  ok(await mp('starter', [{ t: 'sale', m: 20 }, { t: 'entra', m: 35 }, { t: 'sale', m: 50 }], 50) === 35, 'volantes: 20 + 15 = 35 (benjamín 50)');
  ok(await mp('substitute', [{ t: 'entra', m: 10 }, { t: 'sale', m: 25 }, { t: 'entra', m: 40 }], 60) === 35, 'volantes suplente: 15 + 20 = 35');
  ok(await mp('starter', [{ t: 'am2', m: 70 }], 90) === 70, 'doble amarilla deducida al 70 corta en 70');
  ok(await mp('starter', [{ t: 'roja', m: 93 }], 90) === 90, 'roja en el añadido = 90');
  ok(await mp('substitute', [{ t: 'roja', m: 80 }], 90) === 0, 'roja en el banquillo = 0');
  ok(await mp('starter', [{ t: 'roja', m: 50 }, { t: 'entra', m: 60 }], 90) === null, 'volver a entrar expulsado = NULL');
  ok(await mp('starter', [{ t: 'entra', m: 60 }], 90) === null, 'titular que entra = NULL');
  ok(await mp('substitute', [{ t: 'sale', m: 60 }], 90) === null, 'suplente que sale sin entrar = NULL');
  ok(await mp('starter', [{ t: 'sale', m: null }], 90) === null, 'minuto desconocido = NULL');
  ok(await mp('starter', [{ t: 'sale', m: 150 }], 90) === null, 'minuto imposible = NULL');
  ok(await mp('called_up_unknown', [], 90) === null, 'convocado sin dato = NULL');
  ok(await mp('starter', [], null) === null, 'sala sin minutos = NULL');
  ok((await q(`select analytics.duracion_con_prorroga(90,'copa',112) d`))[0].d === 120, 'copa con eventos al 112 → 120');
  ok((await q(`select analytics.duracion_con_prorroga(90,'liga',112) d`))[0].d === 90, 'liga nunca se amplía');

  console.log('2 · posiciones y escalones');
  const pos = await q(`select core.posicion_normalizada('P',null) a, core.posicion_normalizada('C','Defensa central') b,
     core.posicion_normalizada('','Lateral derecho') c, core.posicion_normalizada('AL',null) d, core.posicion_normalizada('ZZ','Algo') e,
     core.linea_de_posicion('MCO') f`);
  ok(pos[0].a === 'POR' && pos[0].b === 'DFC' && pos[0].c === 'LD' && pos[0].d === 'AL' && pos[0].e === null && pos[0].f === 'MED', 'normaliza P, C, literal, sala, desconocido y línea', pos[0]);
  const es = await q(`select analytics.escalon('juvenil','division-honor',null) a, analytics.escalon('juvenil','liga-nacional',null) b,
     analytics.escalon('juvenil','desconocida',2::smallint) c, analytics.escalon('aficionados','tercera-federacion',null) d`);
  ok(es[0].a === 1 && es[0].b === 2 && es[0].c === 4 && es[0].d === 5, 'escalones', es[0]);
  const nc = await q(`select * from analytics.nacimiento_de_categoria('juvenil', 2025::smallint)`);
  ok(nc[0].desde === 2007 && nc[0].hasta === 2009, 'juvenil 2025-26 = nacidos 2007-2009', nc[0]);

  console.log('3 · fixture: club con A y B, cadete que sube, traspaso, expulsiones, árbitro');
  await db.exec(`
    insert into core.federation (codigo,nombre,adaptador) values ('cyl','Castilla y León','pnfg');
    insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
    insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,division,genero)
      values (1,1,'JA','Liga Nacional Juvenil','juvenil','futbol11','liga-nacional','masculina'),
             (1,1,'JB','Primera Provincial Juvenil','juvenil','futbol11','primera','masculina'),
             (1,1,'CA','Regional Cadete','cadete','futbol11','division-honor-regional','masculina');
    insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G1','Grupo 7'),(2,'G2','Grupo 1'),(3,'G3','Grupo A');
    insert into core.matchday (phase_group_id,numero) select g,n from generate_series(1,3) g, generate_series(1,10) n;
    insert into core.club (federation_id,nombre_canonico) values (1,'U.D. Valdecastro'),(1,'C.D. Navalcruz'),(1,'Rival 1'),(1,'Rival 2'),(1,'Rival 3');
    -- team_season: 1 Valdecastro Juvenil A, 2 Valdecastro Juvenil B, 3 Valdecastro Cadete, 4 Navalcruz Juvenil, 5 Rival1 JA, 6 Rival2 JB, 7 Rival3 Cad
    insert into core.team_season (club_id,season_id,nombre,categoria) values
      (1,1,'U.D. Valdecastro "A"','juvenil'),(1,1,'U.D. Valdecastro "B"','juvenil'),(1,1,'U.D. Valdecastro Cadete','cadete'),
      (2,1,'C.D. Navalcruz','juvenil'),(3,1,'Rival 1','juvenil'),(4,1,'Rival 2','juvenil'),(5,1,'Rival 3','cadete');
    -- team_entry: 1 VA en G1, 2 Navalcruz en G1, 3 Rival1 en G1, 4 VB en G2, 5 Rival2 en G2, 6 VCad en G3, 7 Rival3 en G3
    insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values
      (1,1,'1','U.D. Valdecastro "A"'),(4,1,'2','C.D. Navalcruz'),(5,1,'3','Rival 1'),
      (2,2,'4','U.D. Valdecastro "B"'),(6,2,'5','Rival 2'),(3,3,'6','U.D. Valdecastro Cadete'),(7,3,'7','Rival 3');
    -- 10 jornadas por grupo, del 1 sep cada semana. G1: VA vs Rival1 en casa las impares y Navalcruz vs Rival1 las pares.
    insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,played_at)
      select 1, md.id, 1, case when md.numero % 2 = 1 then 1 else 2 end, 3, 2, 1, 'played', date '2025-09-06' + 7*(md.numero-1)
        from core.matchday md where md.phase_group_id = 1;
    insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,played_at)
      select 1, md.id, 2, case when md.numero % 2 = 1 then 2 else 1 end, 3, 0, 0, 'played', date '2025-09-07' + 7*(md.numero-1)
        from core.matchday md where md.phase_group_id = 1;
    insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,played_at)
      select g, md.id, 1, case g when 2 then 4 else 6 end, case g when 2 then 5 else 7 end, 1, 1, 'played', date '2025-09-06' + 7*(md.numero-1)
        from core.matchday md cross join lateral (select md.phase_group_id g) x where md.phase_group_id in (2,3);
    -- personas: 1 Pablo (B, sube al A), 2 Hugo (cadete que juega juvenil A), 3 Rubén (Valdecastro A → Navalcruz en J6),
    -- 4 Óscar (dos amarillas sueltas en J2 del A, falta J3 y J4... del A), 5 Leo (doble amarilla + roja en J1 del B),
    -- 6 Íker (5 amarillas en el B), 7..11 relleno del A, 12 árbitro Juan García Pérez (dos personas, dos formatos)
    insert into core.person (nombre_mostrado) values ('Pablo Araujo Gil'),('Hugo Collado Ruiz'),('Rubén Calvo Mesa'),('Óscar Benito Sanz'),
      ('Leo Prado Lara'),('Íker Vela Mora'),('A1 X Y'),('A2 X Y'),('A3 X Y'),('A4 X Y'),('A5 X Y'),('GARCIA PEREZ, JUAN'),('Juan García Pérez / Ana López Ruiz / Iván Mora Gil');
  `);
  // Apariciones: helper
  const partidosDe = async (te) => (await q(`select m.id, md.numero, m.played_at::date f from core.match m join core.matchday md on md.id=m.matchday_id
     where $1 in (m.home_team_entry_id, m.away_team_entry_id) order by m.played_at`, [te]));
  const ap = async (match, person, te, cond, orden) => q(`insert into core.appearance (match_id,person_id,team_entry_id,season_id,lado,condition,orden)
     select $1,$2,$3,1, case when m.home_team_entry_id=$3 then 'local' else 'visitante' end, $4, $5 from core.match m where m.id=$1 returning id`, [match, person, te, cond, orden]);
  let so = 1;
  const ev = async (match, person, te, tipo, min, subtipo = null) => q(`insert into core.match_event (match_id,person_id,team_entry_id,event_type,subtipo,minute_base,lado,source_order,sujeto_tipo)
     select $1,$2,$3,$4,$5,$6, case when m.home_team_entry_id=$3 then 'local' else 'visitante' end, $7, 'jugador' from core.match m where m.id=$1`, [match, person, te, tipo, subtipo, min, so++]);

  const pa = await partidosDe(1);   // Valdecastro A: 10 partidos
  const pb = await partidosDe(4);   // Valdecastro B: 10
  const pc = await partidosDe(6);   // Cadete: 10
  const pn = await partidosDe(2);   // Navalcruz
  // Relleno A (7..11) titulares siempre; Óscar (4) titular salvo J3-J4 (sanción) → reaparece J5
  for (const [i, m] of pa.entries()) {
    for (const p of [7, 8, 9, 10, 11]) await ap(m.id, p, 1, 'starter', p);
    if (!(i === 2 || i === 3)) await ap(m.id, 4, 1, 'starter', 4);
    // Rubén titular en el A las 5 primeras
    if (i < 5) await ap(m.id, 3, 1, 'starter', 3);
    // Pablo (del B) sube al A en J7 y J8 como suplente, entra al 60
    if (i === 6 || i === 7) { await ap(m.id, 1, 1, 'substitute', 14); await ev(m.id, 1, 1, 'entra', 60); }
    // Hugo (cadete) titular con el juvenil A en J9 y J10, sale al 75
    if (i >= 8) { await ap(m.id, 2, 1, 'starter', 2); await ev(m.id, 2, 1, 'sale', 75); }
  }
  // Óscar: dos amarillas sueltas en J2 (minutos 30 y 70) → doble deducida, minutos 70
  await ev(pa[1].id, 4, 1, 'tarjeta_amarilla', 30); await ev(pa[1].id, 4, 1, 'tarjeta_amarilla', 70);
  // Rubén en el Navalcruz desde la J6 de su calendario
  for (const m of pn.filter((m) => m.f > pa[4].f)) await ap(m.id, 3, 2, 'starter', 3);
  // B: Pablo titular siempre; Leo titular, doble amarilla + roja en J1 (min 50), vuelve en J3; Íker 1 amarilla por partido J1-J6
  for (const [i, m] of pb.entries()) {
    await ap(m.id, 1, 4, 'starter', 1);
    if (i !== 1) await ap(m.id, 5, 4, 'starter', 5);
    if (i !== 5) await ap(m.id, 6, 4, 'starter', 6);   // falta la J6 tras la 5.ª amarilla en la J5
    if (i < 5) await ev(m.id, 6, 4, 'tarjeta_amarilla', 40);
  }
  await ev(pb[0].id, 5, 4, 'tarjeta_amarilla', 20); await ev(pb[0].id, 5, 4, 'tarjeta_roja', 50, 'doble_amarilla'); await ev(pb[0].id, 5, 4, 'tarjeta_roja', 50);
  // Cadete: Hugo titular siempre
  for (const m of pc) await ap(m.id, 2, 6, 'starter', 2);
  // Árbitro: persona 12 en los partidos del A, persona 13 en los del B (misma persona, dos formatos)
  for (const m of pa) await q(`insert into core.match_official (match_id,person_id,rol) values ($1,12,'principal')`, [m.id]);
  for (const m of pb) await q(`insert into core.match_official (match_id,person_id,rol) values ($1,13,'principal')`, [m.id]);
  await db.exec(`insert into ops.coverage_checkpoint (phase_group_id) values (1),(2),(3);`);

  // Proyección como lo hará el proyector
  let personas = [];
  for (const g of [1, 2, 3]) { const r = (await q('select analytics.proyecta_grupo($1) r', [g]))[0].r; personas.push(...r.personas); }
  personas = [...new Set(personas)];
  for (const e of [1, 2, 3]) await q('select analytics.proyecta_sanciones_edicion($1)', [e]);
  await q('select analytics.proyecta_tramos_grupo(g) from generate_series(1,3) g');
  await q('select analytics.proyecta_perfiles($1::bigint[])', [personas]);
  await q('select analytics.proyecta_temporadas($1::bigint[])', [personas]);
  // 0036: el ojeo es una tabla que rellena el proyector tras las temporadas (proyecta_ojeo por personas).
  if ((await q(`select to_regproc('analytics.proyecta_ojeo') is not null ok`))[0].ok) { await q('select analytics.proyecta_ojeo($1::bigint[])', [personas]); await q('select analytics.puntua_ojeo()'); }
  await q('select analytics.recalcula_arbitros()');

  const s = async (p, te) => (await q('select * from analytics.player_team_season_summary where person_id=$1 and team_entry_id=$2', [p, te]))[0];
  const oscar = await s(4, 1);
  ok(oscar.amarillas === 2 && oscar.rojas === 1 && oscar.dobles_deducidas === 1 && oscar.dobles_amarillas === 1, 'Óscar: 2 amarillas sueltas = 1 doble deducida, 1 expulsión', oscar);
  ok(oscar.minutos_exactos === 8 * 90 - 20, 'Óscar: 8 partidos, el de la doble amarilla cuenta 70 → 700', oscar.minutos_exactos);
  const leo = await s(5, 4);
  ok(leo.rojas === 1 && leo.dobles_amarillas === 1 && leo.rojas_directas === 0, 'Leo: doble + roja en el acta = UNA expulsión, no directa', leo);
  ok(leo.minutos_exactos === 50 + 8 * 90, 'Leo: 50 + 8×90', leo.minutos_exactos);

  const sanc = await q('select person_id, motivo, partidos_perdidos, cierre, jugo_con_otro_equipo from analytics.sancion_inferida order by person_id, fecha');
  const so4 = sanc.find((x) => x.person_id === 4);
  ok(so4 && so4.motivo === 'doble_amarilla_deducida' && so4.partidos_perdidos === 2 && so4.cierre === 'reaparece', 'Óscar: 2 partidos sin jugar y reaparece', so4);
  const so5 = sanc.find((x) => x.person_id === 5);
  ok(so5 && so5.motivo === 'doble_amarilla' && so5.partidos_perdidos === 1 && so5.cierre === 'reaparece', 'Leo: 1 partido', so5);
  const so6 = sanc.find((x) => x.person_id === 6);
  ok(so6 && so6.motivo === 'ciclo_amarillas' && so6.partidos_perdidos === 1, 'Íker: ciclo de 5 amarillas → 1 partido', so6);
  ok(sanc.filter((x) => x.person_id === 6).length === 1, 'Íker: un solo ciclo', sanc.filter((x) => x.person_id === 6));
  ok((await s(4, 1)).partidos_sancion === 2, 'el resumen del equipo recoge partidos_sancion');

  const jt = async (p) => (await q('select * from analytics.jugador_temporada where person_id=$1', [p]))[0];
  const pablo = await jt(1);
  ok(pablo.team_season_principal === 2 && pablo.minutos_principal === 900 && pablo.minutos_superior === 60 && pablo.minutos_total === 960,
     'Pablo: ficha en el B (900) + 60 min con el A = 960', { p: pablo.team_season_principal, mp: pablo.minutos_principal, ms: pablo.minutos_superior, t: pablo.minutos_total });
  const hugo = await jt(2);
  ok(hugo.categoria_principal === 'cadete' && hugo.minutos_superior === 150 && hugo.por_encima_de_su_edad === true,
     'Hugo: cadete con 150 min en el juvenil A, «por encima de su edad»', { c: hugo.categoria_principal, s: hugo.minutos_superior, e: hugo.por_encima_de_su_edad });
  const ruben = await jt(3);
  ok(ruben.cambio_club === 'traspaso' && ruben.clubes === 2 && ruben.minutos_otro_club > 0, 'Rubén: traspaso a mitad de temporada', { c: ruben.cambio_club, n: ruben.clubes, o: ruben.minutos_otro_club, f: ruben.fecha_cambio });
  ok(Number(pablo.pct_minutos_principal) === 100, 'Pablo: 100 % de los minutos posibles del B', pablo.pct_minutos_principal);

  const desg = await q('select equipo, papel, minutos_estimados from analytics.minutos_por_equipo m left join lateral (select null papel) x on true where person_id=1 order by minutos_estimados desc');
  ok(desg.length === 2, 'desglose de Pablo: 2 equipos', desg);

  const arb = await q('select * from analytics.arbitro_persona order by person_id');
  ok(arb.length === 2 && arb[0].arbitro_id === arb[1].arbitro_id && arb[1].nombre === 'Juan García Pérez', '«GARCIA PEREZ, JUAN» y «Juan García Pérez / asistentes…» = mismo árbitro (principal = el primero)', arb);
  const at = await q('select * from analytics.arbitro_comparado order by competition_edition_id');
  ok(at.length === 2 && at.find((x) => x.competition_edition_id === 1).expulsiones === 1 && at.find((x) => x.competition_edition_id === 2).expulsiones === 1,
     'árbitro: 1 expulsión por edición (deducida en el A, doble+roja en el B cuenta 1)', at.map((x) => [x.competition_edition_id, x.partidos, x.amarillas, x.expulsiones, x.rojas_directas]));

  const oj = await q('select * from analytics.ojeo_temporada where person_id in (1,2) order by person_id');
  ok(oj.length === 2 && oj[1].nacimiento_desde === 2010 && oj[1].nacimiento_hasta === 2011, 'Hugo: nacido 2010-2011 por ser cadete en 2025-26', oj[1] && [oj[1].nacimiento_desde, oj[1].nacimiento_hasta]);
  ok(oj[0].minutos === 960 && oj[0].mejor_escalon === 2, 'ojeo Pablo: 960 min y mejor escalón 2 (Liga Nacional)', oj[0] && [oj[0].minutos, oj[0].mejor_escalon]);


  console.log('4 · consultas web de ojeo.ts');
  const src = (await import('node:fs')).readFileSync(join(RAIZ, 'apps', 'web', 'src', 'consultas', 'ojeo.ts'), 'utf8').replaceAll('\r\n', '\n');
  const sqlDe = (n) => { const i = src.indexOf(`nombre: '${n}'`); const a = src.indexOf('sql: `', i) + 6; return src.slice(a, src.indexOf('`,\n};', a)).replaceAll('${SQL_FEDERACION_NO_EXCLUIDA}', 'true'); };
  await db.exec(`update core.person set es_menor = true where id = 2;`);
  const oj2 = await q(sqlDe('ojeo-jugadores'), ['cyl', '2025-26', 2007, 2011, null, null, 0, null, null, null, null, 50, false]);
  console.table(oj2.map((r) => ({ pos: r.posicion, nombre: r.nombre, min: r.minutos, esc: r.mejor_escalon, enc: r.minutos_por_encima, nac: `${r.nacimiento_desde}-${r.nacimiento_hasta}`, pts: r.puntuacion })));
  ok(oj2.length > 3 && oj2[0].puntuacion >= oj2.at(-1).puntuacion, 'ojeo ordena por puntuación');
  ok(oj2.find((r) => r.persona_id === 2)?.nombre === null, 'ojeo: menor sin permiso → nombre NULL');
  const solo = await q(sqlDe('ojeo-jugadores'), ['cyl', '2025-26', 2010, 2011, null, null, 0, null, null, true, null, 50, true]);
  ok(solo.length === 1 && solo[0].persona_id === 2 && solo[0].nombre, 'ojeo: nacidos 2010-11 «por encima de su edad» = Hugo, con nombre si hay permiso', solo.map((r) => r.persona_id));
  ok((await q(sqlDe('ojeo-jugadores'), ['otra', '2025-26', null, null, null, null, 0, null, null, null, null, 50, true])).length === 0, 'ojeo: filtro de federación');
  const mpe = await q(sqlDe('minutos-por-equipo'), [1]);
  console.table(mpe.map((r) => ({ t: r.temporada, eq: r.equipo, papel: r.papel, min: r.minutos, pos: r.minutos_posibles, pct: r.pct_minutos })));
  ok(mpe.length === 2 && mpe[0].papel === 'principal' && mpe[1].papel === 'superior', 'desglose Pablo: principal (B) + superior (A)');
  const mh = await q(sqlDe('minutos-por-equipo'), [2]);
  ok(mh.find((r) => r.papel === 'superior')?.categoria === 'juvenil', 'desglose Hugo: el juvenil es «superior»');
  const mr = await q(sqlDe('minutos-por-equipo'), [3]);
  ok(mr.some((r) => r.papel === 'otro_club'), 'desglose Rubén: otro club', mr.map((r) => r.papel));
  const sa = await q(sqlDe('sanciones-inferidas'), [1, null, 50, true]);
  console.table(sa);
  ok(sa.length === 1 && sa[0].partidos_perdidos === 2 && sa[0].rival, 'sanciones de la edición 1 con rival');
  const ar = await q(sqlDe('arbitros'), [null, 1, 50]);
  console.table(ar);
  ok(ar.length === 1 && ar[0].partidos === 10 && ar[0].expulsiones_por_partido > 0, 'árbitros de la edición 1');
  const ca = await q(sqlDe('uso-de-cantera'), [1, 40]);
  console.table(ca);
  ok(ca.find((r) => r.equipo.includes('"A"')).jugadores_de_abajo === 2, 'cantera: el A usa a 2 de abajo (Pablo del B, Hugo del cadete)');

  // Idempotencia
  await q('select analytics.proyecta_sanciones_edicion(1)'); await q('select analytics.proyecta_temporadas($1::bigint[])', [personas]);
  ok((await q('select count(*)::int n from analytics.sancion_inferida'))[0].n === sanc.length, 'sanciones idempotentes');
  ok((await q('select count(*)::int n from analytics.proyeccion_pendiente'))[0].n === 0, 'nada pendiente tras proyectar con versión 2');
  fin();
}
