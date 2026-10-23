-- 0044 · Estados de página: qué secciones tienen datos y, si no, POR QUÉ (para no pintar tablas vacías mudas).
--
-- Por qué (David, 22-23/10/2026: «estados vacíos», «calidad de las páginas»): una clasificación vacía puede
-- significar cuatro cosas muy distintas y el usuario tiene que saber cuál:
--   'sin_datos'  : la competición aún no tiene calendario publicado.
--   'pronto'     : hay calendario pero no se ha jugado nada (con la fecha del primer partido).
--   'pendiente'  : ya se ha jugado según el calendario, pero la federación aún no ha publicado resultados.
--   'no_publica' : se juega y hay resultados, pero esta competición NO publica ese dato (alineaciones,
--                  cambios, tarjetas, árbitros, campos). Lo dice la capacidad medida (0032), no el perfil.
--   'ok'         : hay datos (o aún no se ha medido la capacidad: desconocido ≠ vacío, se pinta lo que haya).
-- La web pinta la sección o, en su lugar, la tarjeta de estado con `mensaje` (CONTENIDO-MICROCOPIA.md):
-- ningún `if (federacion === …)` en el código. Avisos de cabecera: siguen en analytics.avisos_de_datos (0038).

create or replace function analytics.secciones_competicion(p_edicion bigint, p_grupo bigint default null,
                                                           p_hoy date default current_date)
returns table (seccion text, estado text)
language plpgsql stable as $$
#variable_conflict use_column
declare
  v_grupos bigint[]; v_total int; v_jugados int; v_primera date; v_comun text;
  c analytics.edicion_capacidad;
begin
  -- Grupos en array (RENDIMIENTO-BASE §3.1): el partido se lee por el índice de grupo.
  if p_grupo is not null then v_grupos := array[p_grupo];
  else select coalesce(array_agg(id), '{}') into v_grupos from core.phase_group where competition_edition_id = p_edicion;
  end if;
  select count(*) filter (where m.official_status <> 'cancelled'),
         count(*) filter (where m.goles_local is not null),
         min(coalesce(m.played_at::date, m.fecha_prevista)) filter (where m.official_status <> 'cancelled')
    into v_total, v_jugados, v_primera
    from core.match m where m.phase_group_id = any(v_grupos);
  select * into c from analytics.edicion_capacidad where competition_edition_id = p_edicion;

  -- Lo que depende de que se haya jugado algo comparte estado.
  v_comun := case when v_total = 0 then 'sin_datos'
                  when v_jugados = 0 and (v_primera is null or v_primera >= p_hoy) then 'pronto'
                  when v_jugados = 0 then 'pendiente'
                  else 'ok' end;
  return query
  select s.seccion,
         case when s.necesita is null then case when v_comun = 'sin_datos' then 'sin_datos' else 'ok' end
              when v_comun <> 'ok' then v_comun
              when c.competition_edition_id is null or s.necesita = 'jugado' then 'ok'          -- sin medir: se pinta lo que haya
              when s.necesita = 'alineaciones' and not c.registra_alineaciones then 'no_publica'
              when s.necesita = 'cambios' and not (c.registra_alineaciones and c.registra_cambios) then 'no_publica'
              when s.necesita = 'tarjetas' and not (c.registra_alineaciones and c.registra_tarjetas) then 'no_publica'
              when s.necesita = 'arbitros' and c.con_arbitro = 0 then 'no_publica'
              when s.necesita = 'campos' and c.con_campo = 0 then 'no_publica'
              else 'ok' end
    from (values ('calendario', 1, null), ('resultados', 2, 'jugado'), ('clasificacion', 3, 'jugado'),
                 ('alineaciones', 4, 'alineaciones'), ('goleadores', 5, 'alineaciones'), ('minutos', 6, 'cambios'),
                 ('tarjetas', 7, 'tarjetas'), ('arbitros', 8, 'arbitros'), ('campos', 9, 'campos')) s(seccion, orden, necesita)
   order by s.orden;
end $$;

-- Con los mensajes para la tarjeta de estado (separado para que la lógica de arriba se lea sola).
create or replace function analytics.estado_secciones(p_edicion bigint, p_grupo bigint default null, p_hoy date default current_date)
returns table (seccion text, estado text, mensaje text, fecha date)
language sql stable as $$
  with s as (select * from analytics.secciones_competicion(p_edicion, p_grupo, p_hoy)),
  primera as (
    select min(coalesce(m.played_at::date, m.fecha_prevista)) f
      from core.match m
     where m.official_status <> 'cancelled'
       and m.phase_group_id = any(case when p_grupo is not null then array[p_grupo]
                                    else array(select id from core.phase_group where competition_edition_id = p_edicion) end))
  select s.seccion, s.estado,
         case s.estado
           when 'ok' then null
           when 'sin_datos' then 'Esta competición aún no tiene calendario publicado.'
           when 'pronto' then coalesce('La competición empieza el ' || to_char((select f from primera), 'DD/MM/YYYY')
                                       || '. Aquí verás los datos en cuanto se jueguen los partidos.',
                                       'Aún no se ha jugado ningún partido.')
           when 'pendiente' then 'Ya se han jugado partidos, pero la federación todavía no ha publicado los resultados.'
           when 'no_publica' then case s.seccion
             when 'alineaciones' then 'Esta competición publica los resultados, pero no las alineaciones.'
             when 'goleadores' then 'Esta competición no publica quién marca los goles: no hay goleadores.'
             when 'minutos' then 'Esta competición no apunta los cambios: no se pueden calcular los minutos jugados.'
             when 'tarjetas' then 'Esta competición no apunta las tarjetas: no hay disciplina ni sanciones.'
             when 'arbitros' then 'Esta competición no publica los árbitros de los partidos.'
             when 'campos' then 'Esta competición no publica en qué campo se juega cada partido.' end
         end,
         case when s.estado = 'pronto' then (select f from primera) end
    from s
$$;

-- Equipo: las secciones de su grupo, con los nombres de la página de equipo (plantilla = alineaciones).
create or replace function analytics.estado_secciones_equipo(p_team_entry bigint, p_hoy date default current_date)
returns table (seccion text, estado text, mensaje text, fecha date)
language sql stable as $$
  select case e.seccion when 'alineaciones' then 'plantilla' when 'resultados' then 'partidos' else e.seccion end,
         e.estado,
         case when e.seccion = 'alineaciones' and e.estado = 'no_publica'
              then 'Esta competición no publica alineaciones: no se conoce la plantilla del equipo.' else e.mensaje end,
         e.fecha
    from core.team_entry te
    join core.phase_group pg on pg.id = te.phase_group_id
    cross join lateral analytics.estado_secciones(pg.competition_edition_id, pg.id, p_hoy) e
   where te.id = p_team_entry and e.seccion in ('calendario', 'resultados', 'clasificacion', 'alineaciones', 'goleadores', 'minutos', 'tarjetas')
$$;

grant execute on function analytics.secciones_competicion(bigint, bigint, date), analytics.estado_secciones(bigint, bigint, date),
  analytics.estado_secciones_equipo(bigint, date) to facylf_lector, facylf_app;
