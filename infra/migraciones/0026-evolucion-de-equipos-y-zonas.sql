-- 0026 · Evolución de cada equipo de un club por temporadas, y zonas de ascenso, descenso y promoción
--
-- Qué responde:
--   · «¿Dónde jugó el Juvenil B de este club cada temporada? ¿Subió o bajó?» → la LÍNEA de equipo es
--     club + categoría + género + modalidad + letra de filial (A, B, C…); se sigue temporada a temporada.
--   · «¿Cuántos suben y bajan en esta liga?» → no está en las actas. Se APRENDE de lo que pasó: en cada
--     familia de competición (federación, categoría, género, división, provincia) se mira qué puestos acabaron
--     subiendo, bajando o jugando una fase de ascenso al año siguiente. Si la evidencia no es clara, no se
--     dibuja zona. `core.reglamento_grupo` permite fijarlo a mano y manda sobre lo aprendido.
-- Aditiva: 0001-0025 no se tocan. Necesita 0025 (división y nivel).

-- ── 1. Cada equipo en cada temporada: su grupo de liga, división, nivel y puesto final ────────────────
create table if not exists analytics.linea_equipo_temporada (
  team_entry_id          bigint   primary key references core.team_entry(id) on delete cascade,
  linea                  text     not null,      -- club|categoria|genero|modalidad|letra
  club_id                bigint   not null,
  letra                  text     not null,      -- 'A' cuando el nombre no lleva letra
  season_id              smallint not null,
  anio                   smallint not null,
  phase_group_id         bigint   not null,
  competition_edition_id bigint   not null,
  federation_id          smallint not null,
  categoria              text     not null,
  genero                 text     not null,
  modalidad              text     not null,
  division               text     not null,
  nivel                  smallint,
  provincia              text,
  posicion               smallint,
  equipos                smallint,
  puntos                 smallint,
  origen_posicion        text     check (origen_posicion in ('oficial', 'reconstruida')),
  jugo_fase_ascenso      boolean  not null default false,
  movimiento             text     check (movimiento in ('asciende', 'desciende', 'mantiene', 'desconocido'))
);
create index if not exists linea_equipo_linea_idx on analytics.linea_equipo_temporada (linea, anio);
create index if not exists linea_equipo_club_idx on analytics.linea_equipo_temporada (club_id, anio desc);
create index if not exists linea_equipo_grupo_idx on analytics.linea_equipo_temporada (phase_group_id, posicion);

-- La letra del filial, con la misma regla que `clubDesdeNombreEquipo` (entre comillas, o suelta A-H).
create or replace function core.letra_de_equipo(p_nombre text)
returns text language sql immutable parallel safe as $f$
  -- regexp_match y no substring: substring devuelve el PRIMER grupo, que aquí es la comilla.
  select coalesce(
    upper((regexp_match(btrim(p_nombre), $re$(["'])([^"']{1,3})\1\s*$$re$))[2]),
    (regexp_match(btrim(p_nombre), $re$(?<!\s[A-Z]\.)\s([A-H])$$re$))[1],
    'A')
$f$;

create or replace function analytics.recalcula_evolucion()
returns integer language plpgsql as $$
declare v integer;
begin
  truncate analytics.linea_equipo_temporada;
  with base as (
    select te.id as team_entry_id, ts.club_id, ts.id as team_season_id,
           core.letra_de_equipo(coalesce(te.nombre_en_fuente, ts.nombre)) as letra,
           ce.season_id, se.anio_inicio as anio, pg.id as phase_group_id, ce.id as competition_edition_id,
           ce.federation_id, ce.categoria, ce.genero, ce.modalidad, ce.division, ce.nivel, ce.provincia,
           coalesce(t.jugados, 0) as jugados, t.puntos,
           (ce.ambito in ('copa', 'ascenso') or pg.tipo <> 'liga') as es_fase
      from core.team_entry te
      join core.team_season ts on ts.id = te.team_season_id
      join core.phase_group pg on pg.id = te.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
      join core.season se on se.id = ce.season_id
      left join analytics.team_edition_summary t on t.team_entry_id = te.id
     where not te.retirado
  ),
  -- La liga del equipo esa temporada: el grupo que no es copa ni fase y en el que más jugó.
  liga as (
    select distinct on (team_season_id) * from base
     where not es_fase
     order by team_season_id, jugados desc, team_entry_id
  ),
  fase_ascenso as (
    select distinct b.team_season_id from base b
      join core.phase_group pg on pg.id = b.phase_group_id
      join core.competition_edition ce on ce.id = pg.competition_edition_id
     where ce.ambito = 'ascenso'
        or core.normaliza_nombre(ce.nombre_publicado || ' ' || pg.nombre) ~ '(ascenso|ascens|promoci|play ?off|igoera)'
  ),
  oficial as (
    select distinct on (ss.team_entry_id) ss.team_entry_id, ss.posicion
      from core.standing_snapshot ss
      join core.matchday md on md.id = ss.matchday_id
     where ss.origen = 'oficial'
     order by ss.team_entry_id, md.numero desc
  ),
  reconstruida as (
    select t.team_entry_id,
           rank() over (partition by t.phase_group_id
                        order by t.puntos desc, (t.goles_favor - t.goles_contra) desc, t.goles_favor desc)::smallint as posicion,
           count(*) over (partition by t.phase_group_id)::smallint as equipos
      from analytics.team_edition_summary t
  )
  insert into analytics.linea_equipo_temporada (team_entry_id, linea, club_id, letra, season_id, anio, phase_group_id,
         competition_edition_id, federation_id, categoria, genero, modalidad, division, nivel, provincia,
         posicion, equipos, puntos, origen_posicion, jugo_fase_ascenso)
  select l.team_entry_id,
         l.club_id || '|' || l.categoria || '|' || l.genero || '|' || l.modalidad || '|' || l.letra,
         l.club_id, l.letra, l.season_id, l.anio, l.phase_group_id, l.competition_edition_id, l.federation_id,
         l.categoria, l.genero, l.modalidad, coalesce(l.division, 'desconocida'), l.nivel, l.provincia,
         coalesce(o.posicion, r.posicion),
         coalesce(r.equipos, (select count(*) from core.team_entry x where x.phase_group_id = l.phase_group_id and not x.retirado))::smallint,
         l.puntos,
         case when o.posicion is not null then 'oficial' when r.posicion is not null then 'reconstruida' end,
         exists (select 1 from fase_ascenso f where f.team_season_id = l.team_season_id)
    from liga l
    left join oficial o on o.team_entry_id = l.team_entry_id
    left join reconstruida r on r.team_entry_id = l.team_entry_id
  -- Si dos equipos-temporada de la misma línea caen en la misma temporada (caso raro), gana el que más jugó.
  on conflict (team_entry_id) do nothing;

  -- Movimiento: comparar el nivel con el de la temporada SIGUIENTE de la misma línea (menor = más alto).
  update analytics.linea_equipo_temporada a
     set movimiento = case
           when s.nivel is null or a.nivel is null then 'desconocido'
           when s.nivel < a.nivel then 'asciende'
           when s.nivel > a.nivel then 'desciende'
           else 'mantiene' end
    from analytics.linea_equipo_temporada s
   where s.linea = a.linea and s.anio = a.anio + 1;

  get diagnostics v = row_count;
  return v;
end $$;

-- ── 2. Zonas aprendidas por familia de competición ──────────────────────────────────────────────────
create table if not exists analytics.zona_familia (
  federation_id  smallint not null,
  categoria      text     not null,
  genero         text     not null,
  division       text     not null,
  provincia      text     not null default '',
  ascensos       smallint not null default 0,
  promocion      smallint not null default 0,   -- puestos que juegan fase o playoff de ascenso
  descensos      smallint not null default 0,
  temporadas     smallint not null,             -- temporadas con evidencia
  confianza      numeric(3,2) not null,
  calculado_en   timestamptz not null default now(),
  primary key (federation_id, categoria, genero, division, provincia)
);

-- Reglamento fijado a mano (lo que diga la federación). Manda sobre lo aprendido.
create table if not exists core.reglamento_grupo (
  id             bigint generated always as identity primary key,
  phase_group_id bigint references core.phase_group(id) on delete cascade,
  federation_id  smallint references core.federation(id),
  categoria      text,
  genero         text,
  division       text,
  provincia      text,
  desde_anio     smallint,
  hasta_anio     smallint,
  ascensos       smallint not null default 0,
  promocion      smallint not null default 0,
  descensos      smallint not null default 0,
  promocion_permanencia smallint not null default 0,  -- playout
  fuente         text not null,
  creado_en      timestamptz not null default now(),
  check (phase_group_id is not null or (federation_id is not null and categoria is not null and division is not null))
);

create or replace function analytics.recalcula_zonas()
returns integer language plpgsql as $$
declare v integer;
begin
  truncate analytics.zona_familia;
  with obs as (
    select federation_id, categoria, genero, division, coalesce(provincia, '') as provincia, anio,
           posicion, equipos - posicion + 1 as desde_abajo, movimiento, jugo_fase_ascenso
      from analytics.linea_equipo_temporada
     where division <> 'desconocida' and posicion is not null and equipos >= 6
       and movimiento in ('asciende', 'desciende', 'mantiene')
  ),
  por_puesto as (
    select federation_id, categoria, genero, division, provincia, posicion,
           count(*) as n, avg((movimiento = 'asciende')::int) as p_sube,
           avg((jugo_fase_ascenso and movimiento <> 'asciende')::int) as p_fase
      from obs group by 1,2,3,4,5,6
  ),
  por_cola as (
    select federation_id, categoria, genero, division, provincia, desde_abajo,
           count(*) as n, avg((movimiento = 'desciende')::int) as p_baja
      from obs group by 1,2,3,4,5,6
  ),
  -- n ascensos = cuántos puestos seguidos desde arriba suben en al menos el 60 % de los casos (≥ 2 casos)
  asc_ as (
    select federation_id, categoria, genero, division, provincia,
           coalesce(min(posicion) filter (where p_sube < 0.6 or n < 2), max(posicion) + 1) - 1 as ascensos
      from por_puesto group by 1,2,3,4,5
  ),
  desc_ as (
    select federation_id, categoria, genero, division, provincia,
           coalesce(min(desde_abajo) filter (where p_baja < 0.6 or n < 2), max(desde_abajo) + 1) - 1 as descensos
      from por_cola group by 1,2,3,4,5
  ),
  prom as (
    select p.federation_id, p.categoria, p.genero, p.division, p.provincia,
           coalesce(min(p.posicion) filter (where p.p_fase < 0.5 or p.n < 2), max(p.posicion) + 1) - 1 - a.ascensos as promocion
      from por_puesto p
      join asc_ a using (federation_id, categoria, genero, division, provincia)
     where p.posicion > a.ascensos
     group by 1,2,3,4,5, a.ascensos
  ),
  temporadas as (
    select federation_id, categoria, genero, division, provincia, count(distinct anio) as t from obs group by 1,2,3,4,5
  )
  insert into analytics.zona_familia (federation_id, categoria, genero, division, provincia, ascensos, promocion,
                                      descensos, temporadas, confianza)
  select t.federation_id, t.categoria, t.genero, t.division, t.provincia,
         greatest(coalesce(a.ascensos, 0), 0), greatest(coalesce(p.promocion, 0), 0), greatest(coalesce(d.descensos, 0), 0),
         t.t, least(0.95, round(0.3 + 0.15 * t.t, 2))
    from temporadas t
    left join asc_ a using (federation_id, categoria, genero, division, provincia)
    left join desc_ d using (federation_id, categoria, genero, division, provincia)
    left join prom p using (federation_id, categoria, genero, division, provincia)
   where t.t >= 2;
  get diagnostics v = row_count;
  return v;
end $$;

-- Las zonas que se dibujan en la clasificación de un grupo: reglamento manual si lo hay; si no, lo aprendido.
create or replace view analytics.zonas_de_grupo as
select pg.id as phase_group_id,
       coalesce(rm.ascensos, rf.ascensos, zf.ascensos, 0) as ascensos,
       coalesce(rm.promocion, rf.promocion, zf.promocion, 0) as promocion,
       coalesce(rm.descensos, rf.descensos, zf.descensos, 0) as descensos,
       coalesce(rm.promocion_permanencia, rf.promocion_permanencia, 0) as promocion_permanencia,
       case when rm.id is not null or rf.id is not null then 'reglamento'
            when zf.federation_id is not null then 'aprendida' else 'ninguna' end as origen,
       zf.confianza, zf.temporadas
  from core.phase_group pg
  join core.competition_edition ce on ce.id = pg.competition_edition_id
  join core.season se on se.id = ce.season_id
  left join core.reglamento_grupo rm on rm.phase_group_id = pg.id
  left join lateral (
    select * from core.reglamento_grupo r
     where r.phase_group_id is null and r.federation_id = ce.federation_id and r.categoria = ce.categoria
       and r.division = ce.division and (r.genero is null or r.genero = ce.genero)
       and (r.provincia is null or r.provincia = ce.provincia)
       and (r.desde_anio is null or r.desde_anio <= se.anio_inicio) and (r.hasta_anio is null or r.hasta_anio >= se.anio_inicio)
     order by r.id desc limit 1) rf on true
  left join analytics.zona_familia zf
         on zf.federation_id = ce.federation_id and zf.categoria = ce.categoria and zf.genero = ce.genero
        and zf.division = ce.division and zf.provincia = coalesce(ce.provincia, '') and zf.confianza >= 0.6;

grant select on analytics.linea_equipo_temporada, analytics.zona_familia, analytics.zonas_de_grupo, core.reglamento_grupo to facylf_lector;
grant select, insert, update, delete on analytics.linea_equipo_temporada, analytics.zona_familia, core.reglamento_grupo to facylf_publicador;
grant select on analytics.zonas_de_grupo to facylf_publicador;
grant usage, select on sequence core.reglamento_grupo_id_seq to facylf_publicador;
grant execute on function core.letra_de_equipo(text) to facylf_lector, facylf_publicador;
grant execute on function analytics.recalcula_evolucion(), analytics.recalcula_zonas() to facylf_publicador;
