// 0037: el recorrido completo de un usuario — perfil, preferencias, favoritos sin duplicados, Mi panel,
// avisos leídos, exportar mis datos y darse de baja.
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
   values (1,1,1,1,2,'scheduled', now() + interval '2 days');
 insert into app.usuario (user_id, rol) values ('admin','administrador');
 insert into app.invitacion (codigo, creada_por, paquete, usos_max) values ('FAMILIA-2026','admin','ojeador',3);
`);
console.log('1 · alta y perfil');
ok((await q(`select app.alta_usuario('ana','FAMILIA-2026','Ana') r`))[0].r === 'activo', 'alta con invitación');
let pf = (await q(`select * from app.perfil('ana')`))[0];
ok(pf.paquete === 'ojeador' && pf.capacidades.includes('cruzar_federaciones') && pf.preferencias.correo === 'resumen', 'perfil: paquete, capacidades efectivas y preferencias por defecto', pf.capacidades);
ok((await err(`select app.guarda_perfil('ana', '   ', 'Europe/Madrid')`))?.includes('NOMBRE_NO_VALIDO'), 'nombre vacío → error');
ok((await err(`select app.guarda_perfil('ana', 'Ana G.', 'Marte/Olimpo')`))?.includes('ZONA_NO_VALIDA'), 'zona horaria inventada → error');
await q(`select app.guarda_perfil('ana', 'Ana G.', 'Atlantic/Canary')`);
pf = (await q(`select * from app.perfil('ana')`))[0];
ok(pf.nombre === 'Ana G.' && pf.zona_horaria === 'Atlantic/Canary', 'nombre y zona guardados');

console.log('2 · preferencias');
ok((await err(`select app.guarda_preferencias('ana', '{"correo":"siempre"}')`))?.includes('CORREO_NO_VALIDO'), 'correo con valor inventado → error');
ok((await err(`select app.guarda_preferencias('ana', '{"eventos":["resultado","goles_rivales"]}')`))?.includes('EVENTO_NO_VALIDO'), 'evento inventado → error');
await q(`select app.guarda_preferencias('ana', '{"correo":"nunca","eventos":["resultado","acta"],"silencio_desde":"23:00","silencio_hasta":"08:00"}')`);
const pa = (await q(`select * from app.preferencia_aviso where user_id='ana'`))[0];
ok(pa.correo === 'nunca' && pa.eventos.length === 2 && pa.silencio_desde === '23:00:00', 'preferencias guardadas', pa);
await q(`select app.guarda_preferencias('ana', '{"push":true}')`);
ok((await q(`select eventos from app.preferencia_aviso where user_id='ana'`))[0].eventos.length === 2, 'guardar una sola preferencia no borra las demás');

console.log('3 · favoritos sin duplicados');
const f1 = (await q(`select app.guarda_favorito('ana','equipo',3,'Valdecastro A') id`))[0].id;   // temporada pasada
const f2 = (await q(`select app.guarda_favorito('ana','equipo',1,'Valdecastro Juvenil A') id`))[0].id; // misma línea, esta temporada
ok(f1 === f2, 'el mismo equipo desde dos temporadas = un solo favorito (misma línea)');
const c1 = (await q(`select app.guarda_favorito('ana','club',2,'Navalcruz') id`))[0].id;
const c2 = (await q(`select app.guarda_favorito('ana','club',2,'Navalcruz') id`))[0].id;
ok(c1 === c2 && (await q(`select count(*)::int n from app.favorito where user_id='ana' and tipo='club'`))[0].n === 1, 'el mismo club dos veces = uno (antes se duplicaba)');
ok((await err(`insert into app.favorito (user_id,tipo,entidad_id,etiqueta) values ('ana','club',2,'otra vez')`))?.includes('duplicate'), 'y la base lo impide aunque se inserte a mano');
ok((await err(`select app.guarda_favorito('ana','busqueda',null,'Mi búsqueda','https://malicioso.example')`))?.includes('BUSQUEDA_NO_VALIDA'), 'búsqueda guardada sólo con ruta interna');
const b1 = (await q(`select app.guarda_favorito('ana','busqueda',null,'Sub-19 CyL','/ojeo?fed=cyl&desde=2007') id`))[0].id;
ok((await q(`select app.es_favorito('ana','equipo',1) id`))[0].id === f1 && (await q(`select app.es_favorito('ana','club',1) id`))[0].id === null, 'es_favorito: estrella llena / vacía');
await q(`select app.reordena_favoritos('ana', $1::bigint[])`, [[b1, c1, f1]]);
const acc = await q(`select * from app.mis_accesos('ana')`);
ok(acc.map((a) => a.id).join() === [b1, c1, f1].join(), 'reordenar cambia el orden de Mi panel');
ok(acc.find((a) => a.tipo === 'equipo').url === '/equipo/1' && acc.find((a) => a.tipo === 'busqueda').url.startsWith('/ojeo'), 'Mi panel: enlaces actuales', acc.map((a) => a.url));
ok((await q(`select app.quita_favorito('admin', $1) r`, [c1]))[0].r === false, 'nadie quita favoritos de otro');
ok((await q(`select app.quita_favorito('ana', $1) r`, [c1]))[0].r === true, 'quitar el propio');

console.log('4 · avisos');
await q(`select app.genera_notificaciones()`);   // foto
await db.exec(`update core.match set goles_local=2, goles_visitante=0, official_status='played', played_at=now() - interval '1 hour' where id=1;`);
await q(`select app.genera_notificaciones()`);
ok((await q(`select avisos_sin_leer from app.perfil('ana')`))[0].avisos_sin_leer === 1, 'resultado de su equipo → 1 aviso sin leer');
ok((await q(`select app.marca_leidos('ana') n`))[0].n === 1 && (await q(`select avisos_sin_leer from app.perfil('ana')`))[0].avisos_sin_leer === 0, 'marcar todo leído');
ok((await err(`select app.guarda_suscripcion_push('ana','http://inseguro','k','a','x')`))?.includes('ENDPOINT_NO_VALIDO'), 'push sólo https');
await q(`select app.guarda_suscripcion_push('ana','https://push.example/abc','k','a','Firefox')`);
ok((await q(`select dispositivos_push from app.perfil('ana')`))[0].dispositivos_push === 1, 'dispositivo push guardado');

console.log('5 · visita, exportar y baja');
await q(`select app.registra_visita('ana')`); const t1 = (await q(`select ultimo_acceso from app.usuario where user_id='ana'`))[0].ultimo_acceso;
await q(`select app.registra_visita('ana')`); const t2 = (await q(`select ultimo_acceso from app.usuario where user_id='ana'`))[0].ultimo_acceso;
ok(t1 && String(t1) === String(t2), 'registra_visita no reescribe en menos de 5 minutos');
const ex = (await q(`select app.exporta_mis_datos('ana') d`))[0].d;
ok(ex.cuenta.user_id === 'ana' && ex.favoritos.length === 2 && ex.avisos.length === 1 && ex.dispositivos_push[0].agente === 'Firefox'
   && !JSON.stringify(ex).includes('"auth"'), 'exportar: cuenta, favoritos, avisos y dispositivos (sin claves push)');
ok((await err(`select app.baja_usuario('admin')`))?.includes('ULTIMO_ADMINISTRADOR'), 'el último administrador no puede darse de baja');
await q(`select app.baja_usuario('ana', 'ya no lo uso')`);
const quedan = (await q(`select (select count(*) from app.favorito where user_id='ana') + (select count(*) from app.notificacion where user_id='ana')
  + (select count(*) from app.suscripcion_push where user_id='ana') + (select count(*) from app.preferencia_aviso where user_id='ana') n`))[0].n;
const u = (await q(`select estado, activo, nombre_visible from app.usuario where user_id='ana'`))[0];
ok(Number(quedan) === 0 && u.estado === 'baja' && !u.activo && u.nombre_visible === null, 'baja: se borra lo suyo y la cuenta queda anonimizada', u);
ok((await q(`select app.puede('ana','buscar') p`))[0].p === false, 'tras la baja no puede nada');
fin();
