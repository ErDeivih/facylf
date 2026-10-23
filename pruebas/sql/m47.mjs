// 0047: los recuentos del canónico (/canonico) salen de una fila mantenida por el proyector.
// Lo que se prueba: que el recuento cuadra con las tablas, que se recalcula al pedirlo y que no se
// inventa cifras cuando aún no hay nada (la migración deja una fila; no un «no hay fila»).
import { base29, ok, fin } from './m29.mjs';
const db = await base29();
const q = async (s, p) => (await db.query(s, p)).rows;

console.log('1 · la migración deja una sola fila, con ceros (base vacía)');
const cero = (await q(`select * from ops.recuento_canonico`))[0];
ok(cero && cero.id === 1, 'hay una fila con id = 1');
ok(Number(cero.partidos) === 0 && Number(cero.participaciones) === 0 && Number(cero.personas) === 0,
  'una base vacía cuenta 0 (es una medida, no un desconocido)', cero);

console.log('2 · recuento de un caso pequeño');
await db.exec(`
  insert into core.federation (codigo,nombre,adaptador) values ('cyl','Castilla y León','pnfg');
  insert into core.season (etiqueta,anio_inicio,orden) values ('2025-26',2025,25);
  insert into core.competition_edition (federation_id,season_id,codigo_externo,nombre_publicado,categoria,modalidad)
    values (1,1,'JA','Liga Juvenil','juvenil','futbol11');
  insert into core.phase_group (competition_edition_id,codigo_externo,nombre) values (1,'G1','Grupo 1');
  insert into core.club (federation_id,nombre_canonico) values (1,'A'),(1,'B');
  insert into core.team_season (club_id,season_id,nombre,categoria) values (1,1,'A','juvenil'),(2,1,'B','juvenil');
  insert into core.team_entry (team_season_id,phase_group_id,codigo_externo,nombre_en_fuente) values (1,1,'1','A'),(2,1,'2','B');
  insert into core.matchday (phase_group_id,numero) values (1,1);
  insert into core.match (phase_group_id,matchday_id,source_order,home_team_entry_id,away_team_entry_id,goles_local,goles_visitante,official_status)
    values (1,1,1,1,2,1,0,'played');
  insert into core.match_report (match_id,quality,parser_version) values (1,'correct',1);
  insert into core.person (nombre_mostrado) values ('Una Persona'),('Otra Persona');
  insert into core.appearance (match_id,person_id,team_entry_id,season_id,lado,condition,orden) values
    (1,1,1,1,'local','starter',1),(1,2,2,1,'visitante','starter',1);
  insert into core.match_event (match_id,person_id,team_entry_id,event_type,minute_base,lado,source_order,sujeto_tipo)
    values (1,1,1,'gol',10,'local',1,'jugador');
`);
const r = (await q(`select ops.actualiza_recuento_canonico() as r`))[0].r;
ok(r.federaciones === 1 && r.ediciones === 1 && r.grupos === 1, 'federaciones, ediciones y grupos', r);
ok(r.partidos === 1 && r.informes === 1, 'partidos y actas', r);
ok(r.participaciones === 2 && r.eventos === 1 && r.personas === 2, 'apariciones, eventos y personas', r);

console.log('3 · una fila, no una tabla; repetirlo no duplica');
await q(`select ops.actualiza_recuento_canonico()`);
ok((await q(`select count(*)::int n from ops.recuento_canonico`))[0].n === 1, 'sigue habiendo una fila');
const fila = (await q(`select * from ops.recuento_canonico where id = 1`))[0];
ok(fila.partidos === 1 && fila.participaciones === 2, 'los valores se mantienen', fila);

console.log('4 · el recuento sigue a los datos (no se queda congelado)');
await db.exec(`insert into core.person (nombre_mostrado) values ('Tercera Persona')`);
const r2 = (await q(`select ops.actualiza_recuento_canonico() as r`))[0].r;
ok(r2.personas === 3, 'una persona nueva se cuenta al recalcular', r2.personas);

console.log('5 · la consulta de la web lee exactamente esas columnas');
const columnas = (await q(`select * from ops.recuento_canonico where id = 1`))[0];
const prometidas = ['federaciones','ediciones','grupos','partidos','informes','participaciones','eventos','personas','grupos_completos','calculado_en'];
for (const c of prometidas) ok(c in columnas, `la fila trae «${c}»`);
ok(columnas.calculado_en !== null, 'dice cuándo se contó');
fin();
