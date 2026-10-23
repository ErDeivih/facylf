// 0040: tanda de penaltis, ganador de la eliminatoria y caso de empate sin tanda.
import { base29, ok, fin } from './m29.mjs';
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
const err = async (s, p) => { try { await q(s, p); return null; } catch (e) { return e.message; } };
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('madrid','Madrid','pnfg');
 insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
 insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,genero,ambito) values (1,1,'C','Copa','juvenil','futbol11','masculina','copa');
 insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'R1','Primera ronda');
 insert into core.matchday (phase_group_id,numero) values (1,1);
 insert into core.club (federation_id,nombre_canonico) values (1,'A'),(1,'B');
 insert into core.team_season (club_id,season_id,nombre,categoria) values (1,1,'A','juvenil'),(2,1,'B','juvenil');
 insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','A'),(2,1,'2','B');
 insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,penaltis_local,penaltis_visitante)
   values (1,1,1,1,2,1,1,'played',3,4),(1,1,2,1,2,2,0,'played',null,null),(1,1,3,2,1,0,0,'played',null,null);`);
const g = await q(`select m.source_order, analytics.ganador_partido(m) g from core.match m order by 1`);
ok(g[0].g === 2 && g[1].g === 1 && g[2].g === null, 'ganador: tanda 3-4 → visitante; 2-0 → local; empate sin tanda → desconocido', g);
ok((await err(`update core.match set penaltis_local = 5, penaltis_visitante = 4 where source_order = 2`))?.includes('match_penaltis_check'), 'no puede haber tanda si no hubo empate');
ok((await err(`update core.match set penaltis_local = 4, penaltis_visitante = 4 where source_order = 1`))?.includes('match_penaltis_check'), 'una tanda no acaba empatada');
ok((await err(`update core.match set penaltis_local = 4 where source_order = 3`))?.includes('match_penaltis_check'), 'la tanda va completa o no va');
ok((await q(`select ops.detecta_empates_sin_tanda(1) n`))[0].n === 1, 'caso P4: el empate sin tanda conocida (y no el que la tiene)');
await q(`update core.match set penaltis_local = 5, penaltis_visitante = 3 where source_order = 3`);
await q(`select ops.detecta_empates_sin_tanda(1)`);
ok((await q(`select estado from ops.caso_dato where codigo = 'P4'`))[0].estado === 'resuelto_solo', 'llega la tanda → el caso se cierra solo');
await q(`update core.match set penaltis_local = null, penaltis_visitante = null where source_order = 3`);
await q(`select ops.detecta_empates_sin_tanda(1)`);
ok((await q(`select estado from ops.caso_dato where codigo = 'P4'`))[0].estado === 'abierto', 'si la tanda desaparece, se reabre');
fin();
