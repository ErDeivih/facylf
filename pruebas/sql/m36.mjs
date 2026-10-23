// 0036: ojeo precalculado (mismos datos que el cálculo en vivo, puntuación por quinta), caché de la web.
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
// Datos mínimos: 1 federación, 2 temporadas, 1 grupo por temporada, 3 jugadores.
await db.exec(`
  insert into core.federation (codigo,nombre,adaptador) values ('cyl','Castilla y León','pnfg');
  insert into core.season (etiqueta,anio_inicio,orden) values ('2024-25',2024,24),('2025-26',2025,25);
  insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,division,genero)
    values (1,1,'J1','Liga Nacional Juvenil','juvenil','futbol11','liga-nacional','masculina'),(1,2,'J2','Liga Nacional Juvenil','juvenil','futbol11','liga-nacional','masculina');
  insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G','Grupo'),(2,'G','Grupo');
  insert into core.club (federation_id,nombre_canonico) values (1,'Club A'),(1,'Club B');
  insert into core.team_season (club_id,season_id,nombre,categoria) values (1,1,'A','juvenil'),(2,1,'B','juvenil'),(1,2,'A','juvenil'),(2,2,'B','juvenil');
  insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','A'),(2,1,'2','B'),(3,2,'3','A'),(4,2,'4','B');
  insert into core.matchday (phase_group_id,numero) select g,n from generate_series(1,2) g, generate_series(1,4) n;
  insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,played_at)
    select md.phase_group_id, md.id, 1, case md.phase_group_id when 1 then 1 else 3 end, case md.phase_group_id when 1 then 2 else 4 end, 1, 0, 'played',
           date '2024-09-07' + 365*(md.phase_group_id::int-1) + 7*md.numero from core.matchday md;
  insert into core.person (nombre_mostrado) values ('Uno'),('Dos'),('Tres');
  insert into core.appearance (match_id,person_id,team_entry_id,season_id,lado,condition,orden)
    select m.id, p, case when p < 3 then m.home_team_entry_id else m.away_team_entry_id end, (select season_id from core.competition_edition ce join core.phase_group pg on pg.competition_edition_id = ce.id where pg.id = m.phase_group_id),
           case when p < 3 then 'local' else 'visitante' end, 'starter', p from core.match m, generate_series(1,3) p;
  insert into ops.coverage_checkpoint (phase_group_id) values (1),(2);`);
const personas = [1, 2, 3];
for (const e of [1, 2]) await q('select analytics.recalcula_capacidad_edicion($1)', [e]);
for (const g of [1, 2]) await q('select analytics.proyecta_grupo($1)', [g]);
await q('select analytics.proyecta_temporadas($1::bigint[])', [personas]);
console.log('1 · ojeo precalculado');
ok((await q('select count(*)::int n from analytics.ojeo_jugador'))[0].n === 0, 'antes de proyectar el ojeo, la tabla está vacía');
ok(await q('select analytics.proyecta_ojeo($1::bigint[]) n', [personas]).then((r) => r[0].n === 6), 'proyecta_ojeo: 3 jugadores × 2 temporadas = 6 filas');
const fila = (await q('select * from analytics.ojeo_jugador where person_id = 1 and season_id = 2'))[0];
ok(fila.temporadas_previas_alto_nivel === 1 && Number(fila.minutos_previos) === 360, 'temporada 2: una previa de alto nivel y 360 minutos previos (ventana, sin subconsultas)', [fila.temporadas_previas_alto_nivel, fila.minutos_previos]);
ok(fila.puntuacion === null, 'sin puntuar hasta puntua_ojeo');
await q('select analytics.puntua_ojeo()');
const pu = await q('select person_id, puntuacion, quinta_total from analytics.ojeo_jugador where season_id = 2 order by person_id');
ok(pu.every((r) => r.puntuacion !== null && r.quinta_total >= 1), 'puntua_ojeo rellena puntuación y tamaño de la quinta', pu);
ok((await q('select count(*)::int n from analytics.ojeo_temporada'))[0].n === 6, 'la vista de 0029 sigue funcionando y lee la tabla');
const n2 = (await q('select analytics.recalcula_ojeo() n'))[0].n;
ok(n2 === 6, 'recalcula_ojeo: entera, mismas 6 filas');
console.log('2 · caché de la web');
const inv = (await q('select ops.invalida_grupo(2, $1::bigint[]) n', [[1, 2]]))[0].n;
const et = (await q('select etiqueta from ops.invalidacion order by etiqueta')).map((r) => r.etiqueta);
ok(et.includes('grupo:2') && et.includes('grupo-externo:cyl:G') && et.includes('edicion:2') && et.includes('federacion:cyl') && et.includes('persona:1') && et.some((e) => e.startsWith('club:')), 'invalida_grupo apunta grupo, edición, federación, clubes y personas', et);
ok((await q('select ops.invalida_grupo(2, $1::bigint[]) n', [[1, 2]]))[0].n === 0, 'no repite etiquetas aún sin consumir');
const cons = await q('select * from ops.consume_invalidaciones(1000)');
ok(cons.length === inv && (await q('select count(*)::int n from ops.invalidacion where consumida_en is null'))[0].n === 0, 'la web consume todas de una vez');
const ch = await q(`select nombre, estado from ops.chequeos() where nombre = 'cache_sin_refrescar'`);
ok(ch[0]?.estado === 'ok', 'chequeo de caché en ok cuando la web consume');
fin();
