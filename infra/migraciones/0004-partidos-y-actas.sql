-- 0004 · Partidos, actas, participaciones y eventos.
-- Ver MODELO-DATOS.md §3 «Partido y acta» y §8.

create table core.match (
  id                  bigint   generated always as identity primary key,
  phase_group_id      bigint   not null references core.phase_group(id),
  matchday_id         bigint   not null references core.matchday(id),
  source_order        smallint not null,
  home_team_entry_id  bigint            references core.team_entry(id),
  away_team_entry_id  bigint            references core.team_entry(id),
  goles_local         smallint,
  goles_visitante     smallint,
  official_status     text     not null default 'scheduled'
                        check (official_status in ('scheduled','played','postponed','cancelled','administrative','unknown')),
  played_at           timestamptz,
  fecha_prevista      date,
  hora_confirmada     boolean  not null default false,
  venue_id            bigint            references core.venue(id),
  data_version        bigint   not null default 0,
  unique (phase_group_id, matchday_id, source_order)
);

comment on column core.match.goles_local is
  'NULL significa «sin resultado publicado». Nunca se sustituye por 0. Ver CONTENIDO-MICROCOPIA.md §2.';

create index match_team_date_idx  on core.match(home_team_entry_id, played_at desc, id);
create index match_away_date_idx  on core.match(away_team_entry_id, played_at desc, id);
create index match_grupo_jornada_idx on core.match(phase_group_id, matchday_id, source_order);
create index match_pendiente_idx on core.match(played_at, id)
  where official_status in ('scheduled','postponed');

create table core.match_source (
  id            bigint   generated always as identity primary key,
  match_id      bigint   not null references core.match(id),
  federation_id smallint not null references core.federation(id),
  codigo_acta   text,
  url           text,
  unique (match_id, federation_id, codigo_acta)
);

create table core.match_report (
  match_id       bigint      primary key references core.match(id),
  quality        text        not null
                   check (quality in ('correct','administrative','review','partial','unavailable')),
  parser_version integer     not null,
  archivo_ruta   text,
  archivo_hash   text,
  source_updated_at timestamptz,
  ingested_at    timestamptz not null default now(),
  incidencias    jsonb       not null default '[]'::jsonb
);

comment on column core.match_report.incidencias is
  'Códigos estructurados con parámetros, no texto libre: LINEUP_COUNT_UNEXPECTED, '
  'SCORE_EVENTS_MISMATCH, MINUTE_MISSING, SOURCE_DOES_NOT_SPLIT_LINEUP.';

create index report_review_idx on core.match_report(ingested_at desc, match_id)
  where quality = 'review';

create table core.appearance (
  id             bigint   generated always as identity primary key,
  match_id       bigint   not null references core.match(id),
  person_id      bigint   not null references core.person(id),
  team_entry_id  bigint   not null references core.team_entry(id),
  season_id      smallint not null references core.season(id),
  lado           text     not null check (lado in ('local','visitante')),
  condition      text     not null
                   check (condition in ('starter','substitute','called_up_unknown')),
  dorsal         smallint,
  portero        boolean  not null default false,
  orden          smallint not null,
  unique (match_id, team_entry_id, person_id, orden)
);

comment on column core.appearance.condition is
  'called_up_unknown suma convocatoria y NO suma partido jugado, titularidad ni minutos, salvo que '
  'un match_event independiente demuestre que participó. El cuerpo técnico va en match_staff.';

create index appearance_person_season_idx on core.appearance(person_id, season_id desc, team_entry_id);
create index appearance_team_match_idx    on core.appearance(team_entry_id, match_id, condition);

create table core.match_event (
  id              bigint   generated always as identity primary key,
  match_id        bigint   not null references core.match(id),
  person_id       bigint            references core.person(id),
  team_entry_id   bigint            references core.team_entry(id),
  event_type      text     not null
                    check (event_type in ('gol','tarjeta_amarilla','tarjeta_roja','entra','sale','otro')),
  subtipo         text     check (subtipo in ('normal','penalti','propia_puerta','doble_amarilla')),
  minute_base     smallint,
  minute_added    smallint,
  lado            text     check (lado in ('local','visitante')),
  lado_beneficiado text    check (lado_beneficiado in ('local','visitante')),
  source_order    smallint not null,
  unique (match_id, source_order)
);

comment on column core.match_event.lado_beneficiado is
  'Una propia puerta beneficia al rival aunque el sujeto pertenezca al equipo que la marcó. '
  'Los goleadores se cuentan por person_id + lado, el marcador por lado_beneficiado.';

create index event_person_type_idx on core.match_event(person_id, event_type, match_id);
create index event_match_minute_idx on core.match_event(match_id, minute_base, minute_added, source_order);

create table core.match_staff (
  id            bigint   generated always as identity primary key,
  match_id      bigint   not null references core.match(id),
  person_id     bigint   not null references core.person(id),
  team_entry_id bigint            references core.team_entry(id),
  rol           text     not null,
  unique (match_id, person_id, rol)
);

create table core.match_official (
  id        bigint generated always as identity primary key,
  match_id  bigint not null references core.match(id),
  person_id bigint not null references core.person(id),
  rol       text   not null check (rol in ('principal','asistente1','asistente2','cuarto','otro')),
  unique (match_id, rol)
);

create table core.standing_snapshot (
  phase_group_id bigint   not null references core.phase_group(id),
  matchday_id    bigint   not null references core.matchday(id),
  team_entry_id  bigint   not null references core.team_entry(id),
  posicion       smallint not null,
  puntos         smallint not null,
  jugados        smallint not null,
  ganados        smallint not null,
  empatados      smallint not null,
  perdidos       smallint not null,
  goles_favor    smallint not null,
  goles_contra   smallint not null,
  origen         text     not null default 'oficial'
                   check (origen in ('oficial','reconstruida')),
  primary key (phase_group_id, matchday_id, team_entry_id, origen)
);

comment on table core.standing_snapshot is
  'La clasificación oficial publicada se conserva por jornada. La reconstruida sirve de contraste, '
  'nunca la sustituye.';

create index standings_group_day_idx
  on core.standing_snapshot(phase_group_id, matchday_id, posicion);
