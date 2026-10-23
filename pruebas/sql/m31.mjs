import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
const err = async (s, p) => { try { await q(s, p); return null; } catch (e) { return e.message; } };
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('cyl','CyL','pnfg');
 insert into core.season (etiqueta,anio_inicio,orden) values ('2024-25',2024,24),('2025-26',2025,25);
 insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,genero)
   values (1,2,'J','Liga Nacional Juvenil','juvenil','futbol11','masculina'),(1,1,'J0','Liga Nacional Juvenil','juvenil','futbol11','masculina');
 insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G','Grupo 7'),(2,'G0','Grupo 7');
 insert into core.matchday (phase_group_id,numero) values (1,1),(1,2),(2,1);
 insert into core.club (federation_id,nombre_canonico) values (1,'U.D. Valdecastro'),(1,'C.D. Navalcruz');
 insert into core.team_season (club_id,season_id,nombre,categoria) values (1,2,'U.D. Valdecastro "A"','juvenil'),(2,2,'C.D. Navalcruz','juvenil'),(1,1,'U.D. Valdecastro "A"','juvenil');
 insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','U.D. Valdecastro "A"'),(2,1,'2','C.D. Navalcruz'),(3,2,'3','U.D. Valdecastro "A"');
 insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,official_status,played_at)
   values (1,1,1,1,2,'scheduled', now() + interval '2 days'),(1,2,1,2,1,'scheduled', now() + interval '9 days');
 insert into core.person (nombre_mostrado, es_menor) values ('Martín Ezquerra Valcárcel', true);
`);
console.log('1 · registro');
ok((await err(`select app.alta_usuario('u1')`))?.includes('REGISTRO_SOLO_CON_INVITACION'), 'modo invitación: sin código no entra');
await q(`insert into app.usuario (user_id, rol) values ('admin','administrador')`);
await q(`insert into app.invitacion (codigo, creada_por, paquete, usos_max) values ('FAMILIA-2026','admin','ojeador',1)`);
ok((await q(`select app.alta_usuario('u1','FAMILIA-2026','Ana') r`))[0].r === 'activo', 'con invitación: activo');
ok((await err(`select app.alta_usuario('u2','FAMILIA-2026')`))?.includes('INVITACION_AGOTADA'), 'invitación de un uso: la segunda vez no');
ok((await q(`select paquete from app.usuario where user_id='u1'`))[0].paquete === 'ojeador', 'entra con el paquete de la invitación');
await q(`update app.ajuste set valor='aprobacion' where clave='registro_modo'`);
ok((await q(`select app.alta_usuario('u2') r`))[0].r === 'pendiente', 'modo aprobación: pendiente');
ok((await q(`select app.puede('u2','buscar') p`))[0].p === false, 'pendiente no puede nada');
await q(`select app.aprueba_usuario('u2','admin')`);
ok((await q(`select app.puede('u2','buscar') p`))[0].p === true, 'aprobado: puede buscar');
ok((await err(`select app.aprueba_usuario('u2','u1')`))?.includes('SIN_PERMISO'), 'sólo un administrador aprueba');

console.log('2 · favoritos');
await q(`insert into app.favorito (user_id,tipo,entidad_id,etiqueta) values ('u1','equipo',3,'Valdecastro Juvenil A')`);   // guardado la temporada pasada
ok((await q(`select clave from app.favorito where user_id='u1'`))[0].clave === '1|juvenil|masculina|futbol11|A', 'el equipo se guarda como línea');
await q(`insert into app.favorito (user_id,tipo,entidad_id,etiqueta) values ('u2','grupo',1,'Liga Nacional G7'),('u1','jugador',1,'Martín')`);
await q(`update app.ajuste set valor='3' where clave='max_favoritos'`);
ok((await err(`insert into app.favorito (user_id,tipo,entidad_id,etiqueta) values ('u1','club',2,'x'),('u1','club',1,'y')`))?.includes('DEMASIADOS_FAVORITOS'), 'tope de favoritos');
const acc = await q(`select * from app.mis_accesos('u1')`);
console.table(acc.map((a) => ({ tipo: a.tipo, etiqueta: a.etiqueta, url: a.url, proximo: a.proximo })));
ok(acc[0].url === '/equipo/1' && acc[0].proximo?.includes('Navalcruz'), 'Mi panel: el favorito de la temporada pasada apunta al equipo de ahora y su próximo partido');

console.log('3 · notificaciones');
let r = (await q(`select app.genera_notificaciones() r`))[0].r;
ok(r.primera === true && r.avisos === 0 && r.partidos_vigilados === 2, 'primera pasada: sólo foto', r);
await db.exec(`insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,official_status,played_at)
   values (1,2,2,1,2,'scheduled', now() + interval '16 days');
 update core.match set played_at = played_at + interval '2 hours' where id = 2;`);
r = (await q(`select app.genera_notificaciones() r`))[0].r;
let n = await q(`select user_id, tipo, titulo, cuerpo from app.notificacion order by id`);
console.table(n);
ok(n.some((x) => x.user_id === 'u1' && x.tipo === 'programado') && n.some((x) => x.user_id === 'u2' && x.tipo === 'programado'), 'nuevo partido → aviso al que sigue el equipo y al que sigue el grupo');
ok(n.some((x) => x.tipo === 'cambio_horario'), 'cambio de hora → aviso');
await db.exec(`update core.match set goles_local=3, goles_visitante=1, official_status='played', played_at = now() - interval '1 hour' where id = 1;
  insert into core.match_report (match_id, quality, parser_version) values (1,'correct',1);
  insert into core.appearance (match_id,person_id,team_entry_id,season_id,lado,condition,orden) values (1,1,1,2,'local','starter',9);
  insert into core.match_event (match_id,person_id,team_entry_id,event_type,minute_base,lado,source_order,sujeto_tipo) values (1,1,1,'gol',17,'local',1,'jugador');`);
r = (await q(`select app.genera_notificaciones() r`))[0].r;
n = await q(`select user_id, tipo, titulo from app.notificacion where id > 4 order by id`);
console.table(n);
ok(n.some((x) => x.user_id === 'u1' && x.tipo === 'resultado' && x.titulo.includes('3-1')), 'resultado 3-1');
ok(n.some((x) => x.tipo === 'acta'), 'acta publicada');
const jug = n.find((x) => x.tipo === 'jugador');
ok(jug && jug.titulo === 'Un jugador que sigues marcó 1 gol', 'jugador menor sin permiso: sin nombre', jug);
const antes = (await q(`select count(*)::int c from app.notificacion`))[0].c;
await q(`select app.genera_notificaciones()`);
ok((await q(`select count(*)::int c from app.notificacion`))[0].c === antes, 'idempotente: otra pasada no repite');
await db.exec(`update core.match set goles_local=1, goles_visitante=1, official_status='played' where matchday_id = 2;`);
await q(`select app.genera_notificaciones()`);
ok((await q(`select count(*)::int c from app.notificacion where clave='jornada:2' and user_id='u2'`))[0].c === 1, 'jornada 2 completa → aviso a quien sigue el grupo');
await q(`insert into app.preferencia_aviso (user_id, eventos) values ('u2', array['resultado'])`);
fin();
