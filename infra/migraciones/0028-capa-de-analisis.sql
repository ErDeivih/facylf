-- 0028 · Capa de análisis (modelo en estrella) para explotar los datos a escala
--
-- Para qué: comparar ligas y federaciones, estudiar la calidad de una categoría, la progresión de
-- jugadores o la ventaja de campo… con herramientas de análisis (DuckDB, Python, Excel) sin tocar el
-- canónico ni conocer su modelo interno. Son VISTAS de sólo lectura sobre core y analytics: no duplican
-- datos. Para trabajar fuera, se exportan a Parquet (docs/plataforma-web/PLATAFORMA-NACIONAL.md §8.2).
--
-- Privacidad: los nombres de menores salen VACÍOS en esta capa. Quien necesite verlos lo hace en la web,
-- con la capacidad `ver_menores_nombres` y registro de acceso.
-- Aditiva: 0001-0027 no se tocan.

create schema if not exists dwh;

create or replace view dwh.dim_temporada as
select id as temporada_id, etiqueta, anio_inicio, orden from core.season;

create or replace view dwh.dim_competicion as
select pg.id as grupo_id, pg.nombre as grupo, pg.tipo as tipo_grupo, ce.id as edicion_id, ce.nombre_publicado as edicion,
       ce.season_id as temporada_id, f.id as federacion_id, f.codigo as federacion, core.familia_de(f.id) as familia,
       ce.categoria, ce.genero, ce.modalidad, ce.division, ce.nivel, ce.ambito, ce.provincia,
       ce.classification_confidence as confianza_clasificacion, cc.visibility_state as cobertura
  from core.phase_group pg
  join core.competition_edition ce on ce.id = pg.competition_edition_id
  join core.federation f on f.id = ce.federation_id
  left join ops.coverage_checkpoint cc on cc.phase_group_id = pg.id;

create or replace view dwh.dim_equipo as
select te.id as equipo_id, te.phase_group_id as grupo_id, ts.id as equipo_temporada_id, ts.nombre as equipo,
       cl.id as club_id, cl.nombre_canonico as club, cl.municipio, cl.provincia,
       core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre)) as letra, l.linea
  from core.team_entry te
  join core.team_season ts on ts.id = te.team_season_id
  join core.club cl on cl.id = ts.club_id
  left join analytics.linea_equipo_temporada l on l.team_entry_id = te.id;

create or replace view dwh.dim_jugador as
select p.id as persona_id, coalesce(pg.grupo_id, p.id) as jugador_id,        -- jugador_id = persona unificada
       case when p.es_menor then null else p.nombre_mostrado end as nombre,
       p.es_menor, p.identidad_nominal, pp.nacimiento_min, pp.nacimiento_max
  from core.person p
  left join analytics.persona_grupo pg on pg.person_id = p.id
  left join analytics.persona_perfil pp on pp.person_id = p.id;

create or replace view dwh.hecho_partido as
select m.id as partido_id, m.phase_group_id as grupo_id, md.numero as jornada,
       coalesce(m.played_at::date, m.fecha_prevista) as fecha, m.home_team_entry_id as equipo_local_id,
       m.away_team_entry_id as equipo_visitante_id, m.goles_local, m.goles_visitante, m.official_status as estado,
       m.venue_id as campo_id, mr.quality as calidad_acta,
       (select mo.person_id from core.match_official mo where mo.match_id = m.id and mo.rol = 'principal') as arbitro_id
  from core.match m
  join core.matchday md on md.id = m.matchday_id
  left join core.match_report mr on mr.match_id = m.id;

create or replace view dwh.hecho_aparicion as
select a.match_id as partido_id, a.person_id as persona_id, coalesce(pg.grupo_id, a.person_id) as jugador_id,
       a.team_entry_id as equipo_id, a.season_id as temporada_id, a.lado, a.condition as condicion, a.dorsal, a.portero
  from core.appearance a
  left join analytics.persona_grupo pg on pg.person_id = a.person_id;

create or replace view dwh.hecho_evento as
select e.match_id as partido_id, e.source_order as orden, e.event_type as tipo, e.subtipo, e.minute_base as minuto,
       e.minute_added as minuto_anadido, e.lado, e.lado_beneficiado, e.team_entry_id as equipo_id,
       e.person_id as persona_id, coalesce(pg.grupo_id, e.person_id) as jugador_id, e.sujeto_tipo
  from core.match_event e
  left join analytics.persona_grupo pg on pg.person_id = e.person_id;

create or replace view dwh.hecho_jugador_temporada as
select s.person_id as persona_id, coalesce(pg.grupo_id, s.person_id) as jugador_id, s.season_id as temporada_id,
       s.team_entry_id as equipo_id, s.competition_edition_id as edicion_id, s.convocatorias, s.partidos_demostrados,
       s.titularidades, s.suplencias, s.minutos_exactos, s.minutos_estimados, s.minutos_fiables, s.goles,
       s.goles_penalti, s.propias_puerta, s.amarillas, s.rojas, s.partidos_elegibles, s.partidos_cubiertos
  from analytics.player_team_season_summary s
  left join analytics.persona_grupo pg on pg.person_id = s.person_id;

create or replace view dwh.hecho_equipo_temporada as
select t.team_entry_id as equipo_id, t.phase_group_id as grupo_id, t.jugados, t.ganados, t.empatados, t.perdidos,
       t.goles_favor, t.goles_contra, t.puntos, t.jugados_casa, t.jugados_fuera, t.partidos_cubiertos,
       l.posicion, l.equipos, l.origen_posicion, l.movimiento, l.jugo_fase_ascenso
  from analytics.team_edition_summary t
  left join analytics.linea_equipo_temporada l on l.team_entry_id = t.team_entry_id;

grant usage on schema dwh to facylf_lector;
grant select on all tables in schema dwh to facylf_lector;
