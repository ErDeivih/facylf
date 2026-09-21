-- 0005 · Cobertura precalculada, lotes de publicación, agregados y proyección de búsqueda.
-- Ver MODELO-DATOS.md §6-§9, RENDIMIENTO-BUSQUEDA.md §4-§5. ADR-0004, ADR-0005.

create table ops.batch (
  id                bigint      generated always as identity primary key,
  federation_id     smallint    not null references core.federation(id),
  sqlite_origen     text        not null,
  cursor_desde      text,
  cursor_hasta      text,
  parser_version    integer     not null,
  normalizador_version integer  not null,
  filas_insertadas  integer     not null default 0,
  filas_actualizadas integer    not null default 0,
  filas_rechazadas  integer     not null default 0,
  estado            text        not null default 'en_curso'
                      check (estado in ('en_curso','validado','publicado','revertido','fallido')),
  iniciado_en       timestamptz not null default now(),
  terminado_en      timestamptz,
  validacion        jsonb       not null default '{}'::jsonb
);

comment on table ops.batch is
  'Un lote se publica (y se invalida su caché) sólo cuando pasa a estado publicado. '
  'Revertir un lote es una operación soportada, no un arreglo manual.';

create table ops.coverage_checkpoint (
  phase_group_id            bigint   primary key references core.phase_group(id),
  jornadas_esperadas        smallint,
  jornadas_descubiertas     smallint not null default 0,
  jornadas_cerradas         smallint not null default 0,
  partidos_esperados        integer,
  partidos_conocidos        integer  not null default 0,
  partidos_con_resultado    integer  not null default 0,
  actas_enlazadas           integer  not null default 0,
  actas_disponibles         integer  not null default 0,
  actas_parseadas           integer  not null default 0,
  actas_correctas           integer  not null default 0,
  actas_a_revisar           integer  not null default 0,
  complete_through_matchday smallint,
  completitud_historica     boolean  not null default false,
  visibility_state          text     not null default 'oculta'
                              check (visibility_state in ('oculta','parcial_privada','verificada_hasta_jornada','completa')),
  coverage_version          integer  not null default 1,
  calculado_en              timestamptz not null default now()
);

comment on table ops.coverage_checkpoint is
  'La interfaz LEE esta tabla. Nunca recalcula completitud recorriendo trabajos en cada petición.';

create table ops.normalizacion_error (
  id           bigint      generated always as identity primary key,
  batch_id     bigint      not null references ops.batch(id),
  codigo       text        not null,
  parametros   jsonb       not null default '{}'::jsonb,
  registrado_en timestamptz not null default now()
);

-- Agregados ------------------------------------------------------------------
-- Se actualizan SÓLO para las entidades afectadas por un lote. Cada fila guarda su versión
-- de métrica y la versión de datos de la que salió, para poder detectar agregados rancios.

create table analytics.team_edition_summary (
  team_entry_id       bigint   primary key references core.team_entry(id),
  phase_group_id      bigint   not null references core.phase_group(id),
  jugados             smallint not null default 0,
  ganados             smallint not null default 0,
  empatados           smallint not null default 0,
  perdidos            smallint not null default 0,
  goles_favor         smallint not null default 0,
  goles_contra        smallint not null default 0,
  puntos              smallint not null default 0,
  jugados_casa        smallint not null default 0,
  jugados_fuera       smallint not null default 0,
  partidos_elegibles  smallint not null default 0,
  partidos_cubiertos  smallint not null default 0,
  metric_version      integer  not null,
  source_data_version bigint   not null,
  computed_at         timestamptz not null default now()
);

create table analytics.player_team_season_summary (
  person_id              bigint   not null references core.person(id),
  season_id              smallint not null references core.season(id),
  team_entry_id          bigint   not null references core.team_entry(id),
  competition_edition_id bigint   not null references core.competition_edition(id),
  convocatorias          smallint not null default 0,
  partidos_demostrados   smallint not null default 0,
  titularidades          smallint not null default 0,
  suplencias             smallint not null default 0,
  minutos_exactos        integer,
  minutos_estimados      integer,
  goles                  smallint not null default 0,
  goles_penalti          smallint not null default 0,
  propias_puerta         smallint not null default 0,
  amarillas              smallint not null default 0,
  rojas                  smallint not null default 0,
  partidos_elegibles     smallint not null default 0,
  partidos_cubiertos     smallint not null default 0,
  minutos_fiables        boolean  not null default false,
  metric_version         integer  not null,
  source_data_version    bigint   not null,
  computed_at            timestamptz not null default now(),
  primary key (person_id, season_id, team_entry_id)
);

comment on column analytics.player_team_season_summary.minutos_fiables is
  'Si es falso, la web NO muestra goles por 90: muestra goles por partido. Ver MODELO-DATOS.md §8.';

create index player_summary_ranking_idx
  on analytics.player_team_season_summary(competition_edition_id, goles desc, person_id);

create table analytics.player_career_summary (
  person_id           bigint  primary key references core.person(id),
  temporadas          smallint not null default 0,
  equipos             smallint not null default 0,
  federaciones        smallint not null default 0,
  convocatorias       integer  not null default 0,
  partidos_demostrados integer not null default 0,
  goles               integer  not null default 0,
  primera_temporada   text,
  ultima_temporada    text,
  identidad_confirmada boolean not null default false,
  metric_version      integer  not null,
  source_data_version bigint   not null,
  computed_at         timestamptz not null default now()
);

-- Búsqueda -------------------------------------------------------------------

create table analytics.search_entity (
  entity_type     text     not null
                    check (entity_type in ('persona','equipo','club','competicion','arbitro','tecnico','campo')),
  entity_id       bigint   not null,
  display_name    text     not null,
  normalized_name text     not null,
  es_alias        boolean  not null default false,
  federation_id   smallint not null references core.federation(id),
  season_from     smallint,
  season_to       smallint,
  provincia       text,
  club_id         bigint,
  contexto        text,                     -- 'C.D. Ribert Juvenil A · 2025-26'
  popularidad     integer  not null default 0,
  restringida     boolean  not null default false,
  updated_at      timestamptz not null default now(),
  primary key (entity_type, entity_id, normalized_name)
);

comment on table analytics.search_entity is
  'Proyección compacta de búsqueda. Los alias son filas separadas que apuntan a la misma entidad. '
  'restringida = true saca la fila de la búsqueda nominal global (menores).';

create index search_name_trgm_idx
  on analytics.search_entity using gin (normalized_name gin_trgm_ops);

create index search_prefijo_idx
  on analytics.search_entity (normalized_name text_pattern_ops, entity_type);

create index search_facets_idx
  on analytics.search_entity (entity_type, federation_id, season_to desc);

create index search_publica_idx
  on analytics.search_entity (normalized_name text_pattern_ops)
  where restringida = false;
