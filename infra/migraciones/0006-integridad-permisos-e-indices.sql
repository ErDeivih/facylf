-- 0006 · Integridad transversal, permisos de lectura e índices de claves externas.
-- Es aditiva porque 0001-0005 ya se validaron en un entorno de prueba y no deben reescribirse.

-- Normalización estable también ante espacios o puntuación al principio/final.
create or replace function core.normaliza_nombre(texto text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select btrim(regexp_replace(
           lower(public.unaccent('public.unaccent', texto)),
           '[^a-z0-9]+', ' ', 'g'))
$$;

-- Vocabularios y coherencia de catálogo.
alter table core.source_capability
  add constraint source_capability_nombre_check check (capability in (
    'catalogo_competiciones', 'calendario', 'resultado', 'clasificacion_oficial', 'acta',
    'alineacion', 'alineacion_dividida', 'dorsal', 'codigo_persona', 'eventos_gol',
    'minuto_evento', 'subtipo_gol', 'tarjetas', 'cambios', 'cuerpo_tecnico', 'arbitros', 'campo'
  )),
  add constraint source_capability_season_from_check
    check (season_from = '' or season_from ~ '^\d{4}-\d{2}$'),
  add constraint source_capability_season_to_check
    check (season_to is null or season_to ~ '^\d{4}-\d{2}$');

alter table core.season
  add constraint season_etiqueta_coherente_check check (
    anio_inicio = substring(etiqueta from 1 for 4)::smallint
    and right(etiqueta, 2)::smallint = ((anio_inicio + 1) % 100)
  );

alter table core.team_season
  add constraint team_season_categoria_check check (categoria in (
    'aficionados','juvenil','cadete','infantil','alevin','benjamin','prebenjamin','veteranos','desconocida'
  )),
  add constraint team_season_genero_check
    check (genero in ('masculina','femenina','mixta','desconocido'));

alter table core.phase_group
  add constraint phase_group_jornadas_positivas_check
    check (jornadas_previstas is null or jornadas_previstas > 0);

alter table core.matchday
  add constraint matchday_numero_positivo_check check (numero > 0),
  add constraint matchday_id_grupo_uq unique (id, phase_group_id);

alter table core.team_entry
  add constraint team_entry_id_grupo_uq unique (id, phase_group_id);

-- Un partido, su jornada y sus participantes deben pertenecer al mismo grupo.
alter table core.match
  add constraint match_jornada_grupo_fk
    foreign key (matchday_id, phase_group_id) references core.matchday(id, phase_group_id),
  add constraint match_local_grupo_fk
    foreign key (home_team_entry_id, phase_group_id) references core.team_entry(id, phase_group_id),
  add constraint match_visitante_grupo_fk
    foreign key (away_team_entry_id, phase_group_id) references core.team_entry(id, phase_group_id),
  add constraint match_equipos_distintos_check check (
    home_team_entry_id is null or away_team_entry_id is null or home_team_entry_id <> away_team_entry_id
  ),
  add constraint match_marcador_no_negativo_check check (
    (goles_local is null or goles_local >= 0)
    and (goles_visitante is null or goles_visitante >= 0)
  );

alter table core.standing_snapshot
  add constraint standing_jornada_grupo_fk
    foreign key (matchday_id, phase_group_id) references core.matchday(id, phase_group_id),
  add constraint standing_equipo_grupo_fk
    foreign key (team_entry_id, phase_group_id) references core.team_entry(id, phase_group_id),
  add constraint standing_recuentos_no_negativos_check check (
    posicion > 0 and jugados >= 0 and ganados >= 0 and empatados >= 0 and perdidos >= 0
    and goles_favor >= 0 and goles_contra >= 0
  );

alter table core.match_event
  add constraint event_minutos_no_negativos_check check (
    (minute_base is null or minute_base >= 0) and (minute_added is null or minute_added >= 0)
  );

alter table ops.coverage_checkpoint
  add constraint coverage_recuentos_coherentes_check check (
    jornadas_descubiertas >= 0 and jornadas_cerradas >= 0
    and jornadas_cerradas <= jornadas_descubiertas
    and partidos_conocidos >= 0 and partidos_con_resultado >= 0
    and partidos_con_resultado <= partidos_conocidos
    and actas_enlazadas >= 0 and actas_disponibles >= 0 and actas_parseadas >= 0
    and actas_correctas >= 0 and actas_a_revisar >= 0
    and actas_disponibles <= actas_enlazadas
    and actas_parseadas <= actas_disponibles
    and actas_correctas + actas_a_revisar <= actas_parseadas
  );

-- NULL también forma parte de la identidad cuando la fuente carece de código.
create unique index person_source_identity_scope_uq
  on core.person_source_identity(federation_id, codigo_externo, context_key) nulls not distinct;
create unique index match_source_scope_uq
  on core.match_source(match_id, federation_id, codigo_acta) nulls not distinct;

-- PostgreSQL no indexa automáticamente las claves externas. Estos índices cubren joins,
-- comprobaciones y futuras eliminaciones sin recorridos completos de tablas de hechos.
create index competition_edition_season_idx on core.competition_edition(season_id, id);
create index competition_edition_concept_idx on core.competition_edition(competition_id, id)
  where competition_id is not null;
create index club_federation_idx on core.club(federation_id, id);
create index team_season_season_idx on core.team_season(season_id, id);
create index team_alias_federation_idx on core.team_alias(federation_id, id);
create index person_source_identity_person_idx on core.person_source_identity(person_id, id);
create index identity_candidate_person_b_idx on core.identity_candidate(person_b, id);
create index identity_decision_person_a_idx on core.identity_decision(person_a, decidida_en desc, id);
create index identity_decision_person_b_idx on core.identity_decision(person_b, decidida_en desc, id);
create index match_matchday_idx on core.match(matchday_id, id);
create index match_venue_idx on core.match(venue_id, played_at desc, id) where venue_id is not null;
create index match_source_federation_idx on core.match_source(federation_id, id);
create index appearance_season_idx on core.appearance(season_id, person_id, id);
create index event_team_idx on core.match_event(team_entry_id, match_id, id)
  where team_entry_id is not null;
create index match_staff_person_idx on core.match_staff(person_id, match_id);
create index match_staff_team_idx on core.match_staff(team_entry_id, match_id)
  where team_entry_id is not null;
create index match_official_person_idx on core.match_official(person_id, match_id);
create index standings_team_idx on core.standing_snapshot(team_entry_id, matchday_id);
create index batch_federation_idx on ops.batch(federation_id, iniciado_en desc, id);
create index team_summary_group_idx on analytics.team_edition_summary(phase_group_id, team_entry_id);
create index player_summary_season_idx on analytics.player_team_season_summary(season_id, person_id);
create index player_summary_team_idx on analytics.player_team_season_summary(team_entry_id, person_id);
create index search_federation_idx on analytics.search_entity(federation_id, entity_type, entity_id);

-- Mínimo privilegio: ningún rol genérico escribe, y la web sólo puede leer la cobertura operativa
-- que necesita para explicar los datos. El resto de ops sigue reservado al publicador/admin.
revoke create on schema public from public;
revoke all on all tables in schema source, core, analytics, ops from public;
revoke all on all sequences in schema source, core, analytics, ops from public;
revoke execute on function core.normaliza_nombre(text) from public;

grant usage on schema core, analytics, ops to facylf_lector;
grant select on all tables in schema core, analytics to facylf_lector;
grant select on ops.coverage_checkpoint to facylf_lector;
grant execute on function core.normaliza_nombre(text) to facylf_lector, facylf_publicador;

grant usage on schema source, core, analytics, ops to facylf_publicador;
grant select, insert, update, delete on all tables in schema source, core, analytics, ops to facylf_publicador;
grant usage, select on all sequences in schema source, core, analytics, ops to facylf_publicador;
