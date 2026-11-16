-- consulta: partidos
select m.id partido, s.anio_inicio anio, g.id grupo, g.tipo, g.jornadas_previstas jornadas,
       d.numero jornada, d.cerrada, e.nombre_publicado competicion, e.ambito, e.categoria, e.modalidad, e.genero,
       e.nivel, m.official_status estado, e.estado estado_edicion,
       coalesce((m.played_at at time zone 'Europe/Madrid')::date, m.fecha_prevista) fecha,
       case when m.hora_confirmada then extract(hour from m.played_at at time zone 'Europe/Madrid')::int end hora,
       m.home_team_entry_id local, m.away_team_entry_id visitante,
       h.team_season_id equipo_local, v.team_season_id equipo_visitante,
       th.club_id club_local, tv.club_id club_visitante, th.nombre_norm nombre_local, tv.nombre_norm nombre_visitante,
       m.goles_local gl, m.goles_visitante gv, r.quality calidad
  from core.federation f
  join core.competition_edition e on e.federation_id = f.id
  join core.season s on s.id = e.season_id
  join core.phase_group g on g.competition_edition_id = e.id
  join core.match m on m.phase_group_id = g.id
  join core.matchday d on d.id = m.matchday_id
  join core.team_entry h on h.id = m.home_team_entry_id
  join core.team_entry v on v.id = m.away_team_entry_id
  join core.team_season th on th.id = h.team_season_id
  join core.team_season tv on tv.id = v.team_season_id
  left join core.match_report r on r.match_id = m.id
 where f.codigo = %(federacion)s and s.anio_inicio between %(desde)s and %(hasta)s
 order by fecha nulls last, m.id;

-- consulta: eventos
select e.match_id partido, e.event_type tipo, e.subtipo, e.minute_base minuto, e.minute_added añadido,
       e.lado, e.lado_beneficiado beneficiado, e.person_id persona, e.sujeto_tipo sujeto
  from core.match_event e
 where e.match_id = any(%(ids)s)
   and e.event_type in ('gol', 'tarjeta_roja', 'tarjeta_amarilla', 'entra', 'sale')
 order by e.match_id, e.minute_base nulls last, e.minute_added nulls first, e.source_order;

-- consulta: plantillas
-- Convocatoria confirmada y testigos de participación se distinguen al construir las variables.
select a.match_id partido, a.team_entry_id equipo,
       array_agg(distinct a.person_id) convocados,
       array_agg(distinct a.person_id) filter (where a.condition = 'starter') titulares
  from core.appearance a
 where a.match_id = any(%(ids)s)
 group by 1,2 order by 1,2;

-- consulta: tecnicos
select a.match_id partido, a.team_entry_id equipo, min(a.person_id) tecnico
  from core.match_staff a
 where a.match_id = any(%(ids)s) and a.team_entry_id is not null
   and lower(btrim(a.rol)) in ('entrenador', 'entrenador titular', 'primer entrenador', 'entrenatzaile')
 group by 1,2 having count(distinct a.person_id) = 1 order by 1,2;

-- consulta: clasificacion
select a.phase_group_id grupo, a.team_entry_id equipo, d.numero jornada, a.posicion, a.puntos, a.jugados
  from core.standing_snapshot a join core.matchday d on d.id = a.matchday_id
 where a.phase_group_id = any(%(grupos)s) and a.origen = 'oficial'
 order by 1,3,4;

-- consulta: equipos
select a.phase_group_id grupo, a.id equipo, a.retirado, a.team_season_id equipo_temporada,
       ts.club_id club, ts.nombre_norm nombre, a.codigo_externo codigo, a.nombre_en_fuente nombre_fuente
  from core.team_entry a join core.team_season ts on ts.id = a.team_season_id
 where a.phase_group_id = any(%(grupos)s) order by 1,2;

-- consulta: grupos
select g.id grupo, e.codigo_externo competicion, g.codigo_externo codigo, s.anio_inicio anio
  from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
  join core.season s on s.id = e.season_id
 where g.id = any(%(grupos)s);

-- consulta: duraciones
-- Duración por regla de categoría; prescinde de las agregaciones de cobertura a fin de temporada.
select g.id grupo,
       case when e.categoria <> 'desconocida' then analytics.duracion_reglamentaria(e.modalidad, e.categoria) end duracion
  from core.phase_group g join core.competition_edition e on e.id = g.competition_edition_id
 where g.id = any(%(grupos)s);

-- consulta: calendario
select c.phase_group_id grupo, c.jornada, c.home_team_entry_id local, c.away_team_entry_id visitante,
       c.fecha_prevista fecha, c.observado_en, c.orden, c.sha256, to_jsonb(c)->>'origen' origen
  from core.calendario_previsto c where c.phase_group_id = any(%(grupos)s) order by 1,2,c.orden;
