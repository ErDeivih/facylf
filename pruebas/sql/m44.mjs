// 0044: estados de página (sin calendario, pronto, pendiente, no lo publica, ok, sin medir).
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('madrid','Madrid','pnfg');
 insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
 insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,genero,ambito)
   values (1,1,'C1','Liga A','juvenil','futbol11','masculina','regional'), (1,1,'C2','Liga B','juvenil','futbol11','masculina','regional');
 insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G1','Grupo 1'), (2,'G2','Grupo 2');
 insert into core.matchday (phase_group_id,numero) values (1,1),(2,1);
 insert into core.club (federation_id,nombre_canonico) values (1,'A'),(1,'B');
 insert into core.team_season (club_id,season_id,nombre,categoria) values (1,1,'A','juvenil'),(2,1,'B','juvenil');
 insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','A'),(2,1,'2','B');`);
const est = async (ed, gr = null, hoy = null) => Object.fromEntries((await q(
  `select seccion, estado, mensaje, fecha::text from analytics.estado_secciones($1, $2, coalesce($3::date, current_date))`, [ed, gr, hoy]))
  .map((r) => [r.seccion, r]));

let e = await est(2);
ok(e.calendario.estado === 'sin_datos' && e.clasificacion.estado === 'sin_datos' && e.calendario.mensaje.includes('calendario'),
   'sin partidos: «aún no tiene calendario publicado»', e.calendario);

await q(`insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,fecha_prevista)
         values (1,1,1,1,2,'2026-11-08')`);
e = await est(1, null, '2026-10-23');
ok(e.calendario.estado === 'ok' && e.clasificacion.estado === 'pronto' && e.goleadores.estado === 'pronto'
   && e.clasificacion.fecha === '2026-11-08' && e.clasificacion.mensaje.includes('08/11/2026'),
   'calendario sin jugar: «empieza el 08/11/2026» en todas las secciones de resultados', e.clasificacion);
e = await est(1, null, '2026-11-15');
ok(e.resultados.estado === 'pendiente' && e.resultados.mensaje.includes('todavía no ha publicado'),
   'pasada la fecha sin resultado: pendiente de la federación (no «no hay datos»)', e.resultados);

await q(`update core.match set goles_local = 2, goles_visitante = 1, official_status = 'played' where id = 1`);
e = await est(1, null, '2026-11-15');
ok(Object.values(e).every((r) => r.estado === 'ok' && r.mensaje === null), 'con resultados y sin capacidad medida: todo se pinta (desconocido ≠ vacío)');

await q(`insert into analytics.edicion_capacidad (competition_edition_id, partidos, con_resultado, con_acta, lados_con_suplentes,
           lados_con_cambios, partidos_con_tarjetas, goles, goles_con_minuto, con_arbitro, con_campo, apariciones, con_posicion,
           con_capitan, con_esquema, registra_alineaciones, registra_cambios, registra_tarjetas, registra_minuto_gol,
           registra_posiciones, nivel)
         values (1, 1, 1, 0, 0, 0, 0, 3, 0, 0, 1, 0, 0, 0, 0, false, false, false, false, false, 'resultados')`);
e = await est(1, null, '2026-11-15');
ok(e.clasificacion.estado === 'ok' && e.alineaciones.estado === 'no_publica' && e.minutos.estado === 'no_publica'
   && e.tarjetas.estado === 'no_publica' && e.arbitros.estado === 'no_publica' && e.campos.estado === 'ok',
   'sólo resultados: clasificación sí; alineaciones, minutos, tarjetas y árbitros «no lo publica»; campos sí');
await q(`update analytics.edicion_capacidad set registra_alineaciones = true, registra_tarjetas = true, con_arbitro = 1 where competition_edition_id = 1`);
e = await est(1, null, '2026-11-15');
ok(e.alineaciones.estado === 'ok' && e.tarjetas.estado === 'ok' && e.minutos.estado === 'no_publica'
   && e.minutos.mensaje.includes('cambios'), 'alineaciones sin cambios: todo menos minutos, con su motivo', e.minutos);

const eq = Object.fromEntries((await q(`select * from analytics.estado_secciones_equipo(1, '2026-11-15')`)).map((r) => [r.seccion, r]));
ok('plantilla' in eq && 'partidos' in eq && !('arbitros' in eq) && eq.minutos.estado === 'no_publica',
   'equipo: las secciones de su grupo con nombres de la página de equipo', Object.keys(eq));
const t0 = performance.now(); for (let i = 0; i < 20; i++) await est(1);
ok((performance.now() - t0) / 20 < 50, 'rápida (< 50 ms por llamada en PGlite)');
fin();
