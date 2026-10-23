// Consultas de análisis (apps/web/src/consultas/analisis.ts) sobre un caso con respuestas conocidas.
import { base29, ok, fin } from './m29.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(RAIZ, 'apps', 'web', 'src', 'consultas', 'analisis.ts'), 'utf8');
const sqlDe = (n) => { const i = src.indexOf(`nombre: '${n}'`); const a = src.indexOf('sql: `', i) + 6; return src.slice(a, src.indexOf('`,\n};', a)); };
const db = await base29(); const q = async (s, p) => (await db.query(s, p)).rows;
// Equipo A (te 1) contra B (te 2) y C (te 3). Resultados de A, en orden: G G E P G G G; un partido futuro sin resultado.
const res = [[2, 0, true], [1, 0, false], [1, 1, true], [0, 2, false], [3, 1, true], [2, 0, false], [1, 0, true]];
await db.exec(`
 insert into core.federation (codigo,nombre,adaptador) values ('cyl','CyL','pnfg');
 insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
 insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad,genero) values (1,1,'J','Liga','juvenil','futbol11','masculina');
 insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G','Grupo');
 insert into core.matchday (phase_group_id,numero) select 1, n from generate_series(1,8) n;
 insert into core.club (federation_id,nombre_canonico) values (1,'A'),(1,'B'),(1,'C');
 insert into core.team_season (club_id,season_id,nombre,categoria) values (1,1,'Equipo A','juvenil'),(2,1,'Equipo B','juvenil'),(3,1,'Equipo C','juvenil');
 insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','A'),(2,1,'2','B'),(3,1,'3','C');
 insert into core.person (nombre_mostrado, es_menor) values ('Delantero Mayor', false),('Extremo Menor', true),('Lateral', false);`);
for (const [i, [gf, gc, casa]] of res.entries()) {
  const rival = i % 2 ? 3 : 2;
  await q(`insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status,played_at)
    values (1,$1,1,$2,$3,$4,$5,'played', date '2025-09-06' + 7*$6)`, [i + 1, casa ? 1 : rival, casa ? rival : 1, casa ? gf : gc, casa ? gc : gf, i]);
}
await q(`insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,official_status,played_at) values (1,8,1,1,2,'scheduled', now() + interval '3 days')`);
// Resumen de equipo y jugadores (lo que deja el proyector): A marcó 10.
await q(`insert into analytics.team_edition_summary (team_entry_id, phase_group_id, goles_favor, metric_version, source_data_version) values (1,1,10,3,0)`);
await q(`insert into analytics.player_team_season_summary (person_id, season_id, team_entry_id, competition_edition_id, goles, goles_penalti, partidos_demostrados, minutos_exactos, minutos_fiables, metric_version, source_data_version)
  values (1,1,1,1,6,1,7,540,true,3,0),(2,1,1,1,3,0,5,null,false,3,0),(3,1,1,1,0,0,7,630,true,3,0)`);

console.log('1 · forma del equipo');
const f = (await q(sqlDe('forma-del-equipo'), [1, 5]))[0];
console.log(f);
ok(f.jugados === 7 && f.ultimos === 'EPGGG', 'últimos 5 en orden (viejo → nuevo) y sin el partido futuro', f.ultimos);
ok(f.racha_actual === 'G3', 'racha actual: 3 victorias');
ok(f.mayor_victorias === 3 && f.mayor_sin_perder === 3 && f.mayor_sin_ganar === 2, 'rachas más largas: 3 victorias, 3 sin perder, 2 sin ganar', [f.mayor_victorias, f.mayor_sin_perder, f.mayor_sin_ganar]);
ok(f.casa_j === 4 && f.casa_g === 3 && f.casa_e === 1 && f.fuera_j === 3 && f.fuera_p === 1 && f.casa_gf === 7 && f.fuera_gc === 2, 'casa y fuera');
ok(f.porterias_a_cero === 4 && f.sin_marcar === 1 && f.media_gf === 1.43, 'porterías a cero, sin marcar, media de goles', [f.porterias_a_cero, f.sin_marcar, f.media_gf]);
const fv = (await q(sqlDe('forma-del-equipo'), [99, 5]))[0];
ok(fv.jugados === 0 && fv.ultimos === '' && fv.racha_actual === null && fv.media_gf === null, 'equipo sin partidos: ceros y vacíos, no inventa');

console.log('2 · reparto de goles');
const r = await q(sqlDe('reparto-de-goles'), [1, false, 10]);
console.table(r);
ok(r.length === 2 && r[0].pct_goles_equipo === 60 && r[1].pct_acumulado === 90, 'el 60 % de los goles es de uno; los dos primeros suman el 90 %');
ok(r[1].nombre === null && r[1].es_menor, 'menor sin permiso: sin nombre');
ok(r[0].goles_por_90 === 1 && r[1].goles_por_90 === null, 'goles por 90 sólo con minutos fiables');
ok((await q(sqlDe('reparto-de-goles'), [1, true, 10]))[1].nombre === 'Extremo Menor', 'con permiso: nombre');

console.log('3 · rachas del grupo');
const g = await q(sqlDe('rachas-del-grupo'), [1]);
console.table(g);
const a = g.find((x) => x.team_entry_id === 1);
ok(g[0].team_entry_id === 1 && a.ultimos5 === 'EPGGG' && a.racha_actual === 'G3' && a.puntos_ultimos5 === 10, 'A lidera la forma: EPGGG, G3, 10 puntos');
const b = g.find((x) => x.team_entry_id === 2);
ok(b.jugados === 4 && b.ultimos5 === 'PEPP' && b.racha_actual === 'P2' && b.mayor_sin_ganar === 4 && b.mayor_sin_perder === 1, 'B (juega las jornadas impares, donde A hace G E G G): PEPP, P2, sin ganar en 4', b);
fin();
