import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('and','Andalucía','pnfg');
 insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
 insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,genero)
   values (1,1,'B','Alevín Grupo 1','alevin','futbol7','masculina'),(1,1,'S','Primera Andaluza','aficionados','futbol11','masculina');
 insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G1','G1'),(2,'G2','G2');
 insert into core.matchday (phase_group_id,numero) select g,n from generate_series(1,2) g, generate_series(1,4) n;
 insert into core.club (federation_id,nombre_canonico) select 1,'C'||n from generate_series(1,4) n;
 insert into core.team_season (club_id,season_id,nombre) select n,1,'C'||n from generate_series(1,4) n;
 insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','C1'),(2,1,'2','C2'),(3,2,'3','C3'),(4,2,'4','C4');
 insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,played_at)
   select g, md.id, 1, case g when 1 then 1 else 3 end, case g when 1 then 2 else 4 end, 2, 0, 'played', now() - interval '20 days' + md.numero * interval '1 day'
     from core.matchday md cross join lateral (select md.phase_group_id g) x;
 insert into core.person (nombre_mostrado) select 'P'||n from generate_series(1,40) n;
 -- 7 titulares + 3 suplentes por equipo y partido
 insert into core.appearance (match_id,person_id,team_entry_id,season_id,lado,condition,orden)
   select m.id, (t.te-1)*10+s, t.te, 1, t.lado, case when s<=7 then 'starter' else 'substitute' end, s
     from core.match m cross join lateral (values (m.home_team_entry_id,'local'),(m.away_team_entry_id,'visitante')) t(te,lado), generate_series(1,10) s;
 -- Alevín: goles SIN minuto, ningún cambio. Aficionados: cambios, goles con minuto, tarjetas.
 insert into core.match_event (match_id,person_id,team_entry_id,event_type,minute_base,lado,source_order,sujeto_tipo)
   select m.id, 1, 1, 'gol', null, 'local', 1, 'jugador' from core.match m where m.phase_group_id=1;
 insert into core.match_event (match_id,person_id,team_entry_id,event_type,minute_base,lado,source_order,sujeto_tipo)
   select m.id, 21, 3, x.t, 60, 'local', x.o, 'jugador' from core.match m, (values ('sale',1),('gol',2),('tarjeta_amarilla',3),('tarjeta_amarilla',4)) x(t,o) where m.phase_group_id=2;
 insert into core.match_event (match_id,person_id,team_entry_id,event_type,minute_base,lado,source_order,sujeto_tipo)
   select m.id, 28, 3, 'entra', 60, 'local', 5, 'jugador' from core.match m where m.phase_group_id=2;
 insert into core.match_event (match_id,person_id,team_entry_id,event_type,minute_base,lado,source_order,sujeto_tipo)
   select m.id, 31, 4, x.t, 70, 'visitante', x.o, 'jugador' from core.match m, (values ('sale',6),('entra',7)) x(t,o) where m.phase_group_id=2;
 update core.match_event set person_id = 38 where event_type='entra' and team_entry_id=4;
 insert into ops.coverage_checkpoint (phase_group_id) values (1),(2);
`);
for (const e of [1, 2]) await q('select analytics.recalcula_capacidad_edicion($1)', [e]);
const cap = await q('select competition_edition_id e, registra_cambios c, registra_minuto_gol g, registra_tarjetas t, nivel from analytics.edicion_capacidad order by 1');
console.table(cap);
ok(cap[0].c === false && cap[0].g === false && cap[0].nivel === 'alineaciones', 'alevín: no apunta cambios ni minuto de gol → nivel alineaciones');
ok(cap[1].c === true && cap[1].g === true && cap[1].t === true && cap[1].nivel === 'completo', 'aficionados: completo');
for (const g of [1, 2]) await q('select analytics.proyecta_grupo($1)', [g]);
const s1 = (await q('select * from analytics.player_team_season_summary where person_id=1'))[0];
ok(s1.minutos_exactos === null && s1.minutos_estimados === null && s1.partidos_demostrados === 4 && s1.titularidades === 4, 'alevín: 4 partidos y 4 titularidades, minutos NULL (no se inventan 4×60)', s1);
const s21 = (await q('select * from analytics.player_team_season_summary where person_id=21'))[0];
ok(s21.minutos_exactos === 4 * 60 && s21.rojas === 0, 'aficionados: minutos exactos; dos amarillas en el MISMO minuto no son doble amarilla (caso 1.3)', s21);
ok((await q('select count(*)::int n from analytics.proyeccion_pendiente'))[0].n === 0, 'versión 3 proyectada, nada pendiente');
const fc = await q('select * from analytics.federacion_capacidad');
ok(fc.length === 1 && fc[0].ediciones_completas === 1 && fc[0].ediciones_alineaciones === 1, 'resumen por federación', fc[0]);

// Casos
await db.exec(`update core.match set goles_local = 3 where id = (select min(id) from core.match where phase_group_id = 2);`);
let r1 = (await q('select ops.detecta_casos(1) r'))[0].r, r2 = (await q('select ops.detecta_casos(2) r'))[0].r;
let casos = await q('select codigo, entidad, estado from ops.caso_dato order by codigo, entidad');
console.table(casos);
ok(casos.some((c) => c.codigo === 'E1') && casos.some((c) => c.codigo === 'E2'), 'E1 y E2 en el alevín');
ok(casos.filter((c) => c.codigo === '1.3').length === 4, '1.3: dos amarillas en el mismo minuto, 4 partidos');
ok(casos.filter((c) => c.codigo === 'P1').length === 8, 'P1: los 8 partidos con marcador 2-0 (o 3-0) y un solo gol en el acta');
const p1 = casos.find((c) => c.codigo === 'P1');
await q(`insert into core.person (nombre_mostrado) values ('Admin X')`);
await q(`insert into app.usuario (user_id, rol) values ('admin','administrador')`);
const idP1 = (await q(`select id from ops.caso_dato where codigo='P1'`))[0].id;
await q(`select ops.revisa_caso($1,'descartado','admin','el acta oficial pone 3-0, el marcador manda')`, [idP1]);
await q('select ops.detecta_casos(2)');
ok((await q(`select estado from ops.caso_dato where id=$1`, [idP1]))[0].estado === 'descartado', 'descartado por un humano: no se reabre');
await db.exec(`delete from core.match_event where event_type='tarjeta_amarilla' and source_order = 4;`);
await q('select ops.detecta_casos(2)');
ok((await q(`select count(*)::int n from ops.caso_dato where codigo='1.3' and estado='resuelto_solo'`))[0].n === 4, 'arreglado el dato: los 1.3 se resuelven solos');
console.table(await q('select codigo, severidad, abiertos, descartados, resueltos_solos from ops.casos_resumen order by codigo'));
await q('select ops.detecta_casos(null)');
fin();
