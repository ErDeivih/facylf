-- consulta: validacion_historica
-- Mismos JOIN y predicados que eval_modelos.py; ningún JOIN a hechos uno-a-muchos.
select s.etiqueta temporada, f.codigo federacion, count(*) filas,
       count(distinct m.id) partidos_distintos,
       count(distinct (pg.id, d.numero, m.home_team_entry_id, m.away_team_entry_id)) cruces_jornada
  from core.match m
  join core.phase_group pg on pg.id = m.phase_group_id
  join core.competition_edition ce on ce.id = pg.competition_edition_id
  join core.season s on s.id = ce.season_id
  join core.federation f on f.id = ce.federation_id
  join core.matchday d on d.id = m.matchday_id
  join core.team_entry te on te.id = m.home_team_entry_id
  join core.team_season tsl on tsl.id = te.team_season_id
  join core.team_entry tv on tv.id = m.away_team_entry_id
  join core.team_season tsv on tsv.id = tv.team_season_id
 where s.anio_inicio between 2019 and 2025
   and m.goles_local is not null and m.goles_visitante is not null
 group by 1,2 order by 1,2;

-- consulta: partidos
with objetivo as materialized (
  select m.id, s.etiqueta temporada, m.goles_local gl, m.goles_visitante gv, m.official_status,
         m.hora_confirmada, m.played_at, m.fecha_prevista
    from core.federation f
    join core.competition_edition ce on ce.federation_id = f.id
    join core.season s on s.id = ce.season_id
    join core.phase_group pg on pg.competition_edition_id = ce.id
    join core.match m on m.phase_group_id = pg.id
   where f.codigo = 'castilla-leon'
), eventos as (
  select o.id,
         count(*) filter (where e.event_type = 'gol') goles,
         count(e.minute_base) filter (where e.event_type = 'gol') goles_minuto,
         count(*) filter (where e.event_type = 'gol' and e.lado_beneficiado = 'local') goles_local,
         count(*) filter (where e.event_type = 'gol' and e.lado_beneficiado = 'visitante') goles_visitante,
         count(*) filter (where e.event_type = 'entra') cambios,
         count(e.minute_base) filter (where e.event_type = 'entra') cambios_minuto,
         count(*) filter (where e.event_type = 'tarjeta_roja' and e.sujeto_tipo = 'jugador') rojas,
         count(e.minute_base) filter (where e.event_type = 'tarjeta_roja' and e.sujeto_tipo = 'jugador') rojas_minuto
    from objetivo o join core.match_event e on e.match_id = o.id group by o.id
)
select o.temporada, count(*) partidos,
       count(*) filter (where gl is not null and gv is not null) con_resultado,
       count(*) filter (where official_status = 'played') jugados,
       count(*) filter (where played_at is not null or fecha_prevista is not null) con_fecha,
       count(*) filter (where hora_confirmada and played_at is not null) con_hora,
       count(*) filter (where r.quality = 'correct') actas_correctas,
       coalesce(sum(e.goles), 0)::bigint goles, coalesce(sum(e.goles_minuto), 0)::bigint goles_minuto,
       count(*) filter (where gl + gv > 0 and e.goles_local = gl and e.goles_visitante = gv
                         and e.goles = e.goles_minuto) goles_partidos_completos,
       count(*) filter (where e.cambios > 0) partidos_cambios,
       coalesce(sum(e.cambios), 0)::bigint cambios, coalesce(sum(e.cambios_minuto), 0)::bigint cambios_minuto,
       count(*) filter (where e.rojas > 0) partidos_rojas,
       coalesce(sum(e.rojas), 0)::bigint rojas, coalesce(sum(e.rojas_minuto), 0)::bigint rojas_minuto,
       count(a.match_id) arbitro_principal
  from objetivo o
  left join eventos e on e.id = o.id
  left join core.match_report r on r.match_id = o.id
  left join core.match_official a on a.match_id = o.id and a.rol = 'principal'
 group by 1 order by 1;

-- consulta: minutos
-- Agregados canónicos, una fila por persona e inscripción. No son minutos crudos en appearance.
select s.etiqueta temporada, count(*) filas_proyectadas,
       count(*) filter (where a.minutos_estimados is not null) minutos_estimados,
       count(*) filter (where a.minutos_fiables and a.minutos_exactos is not null) minutos_fiables
  from analytics.player_team_season_summary a
  join core.competition_edition e on e.id = a.competition_edition_id
  join core.season s on s.id = e.season_id
  join core.federation f on f.id = e.federation_id
 where f.codigo = 'castilla-leon'
 group by 1 order by 1;

-- consulta: escudos
select s.etiqueta temporada, count(distinct ts.club_id) clubes,
       count(distinct a.club_id) clubes_con_escudo_vigente
  from core.federation f
  join core.competition_edition e on e.federation_id = f.id
  join core.season s on s.id = e.season_id
  join core.phase_group g on g.competition_edition_id = e.id
  join core.team_entry te on te.phase_group_id = g.id
  join core.team_season ts on ts.id = te.team_season_id
  left join core.club_asset a on a.club_id = ts.club_id and a.tipo = 'escudo' and a.vigente
 where f.codigo = 'castilla-leon'
 group by 1 order by 1;

-- consulta: fotos
-- Sólo conteos. Ni binarios, ni URLs, ni nombres de personas.
with personas as (
  select distinct a.season_id, a.person_id
    from core.federation f
    join core.competition_edition e on e.federation_id = f.id
    join core.phase_group g on g.competition_edition_id = e.id
    join core.match m on m.phase_group_id = g.id
    join core.appearance a on a.match_id = m.id and a.season_id = e.season_id
   where f.codigo = 'castilla-leon'
)
select s.etiqueta temporada, count(*) personas_en_convocatorias,
       count(*) filter (where exists (
         select 1 from core.person_asset a where a.person_id = p.person_id and a.season_id = p.season_id
       )) personas_con_foto_de_la_temporada
  from personas p join core.season s on s.id = p.season_id
 group by 1 order by 1;
