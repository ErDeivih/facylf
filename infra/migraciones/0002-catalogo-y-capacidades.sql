-- 0002 · Catálogo deportivo, referencias externas y capacidades por fuente.
-- Ver MODELO-DATOS.md §3-§4 y FEDERACIONES-MATRIZ.md.

create table core.federation (
  id            smallint    generated always as identity primary key,
  codigo        text        not null unique,          -- 'castilla-y-leon', 'madrid', ...
  nombre        text        not null,
  adaptador     text        not null
                  check (adaptador in ('pnfg','isquad','fcf','ninguno')),
  portal_url    text,
  activa        boolean     not null default true,
  creada_en     timestamptz not null default now()
);

comment on table core.federation is
  'Las 19 territoriales. Un identificador externo sólo es único dentro de una federación.';

create table core.source_capability (
  federation_id smallint    not null references core.federation(id),
  capability    text        not null,
  season_from   text        not null default '',      -- '' = desde siempre
  season_to     text,
  support       text        not null
                  check (support in ('full','partial','none','unknown')),
  evidence_url  text,
  nota          text,
  updated_at    timestamptz not null default now(),
  primary key (federation_id, capability, season_from)
);

comment on table core.source_capability is
  'Qué publica cada fuente. ADR-0010. Ausencia de filas de hechos NO significa ausencia de hechos: '
  'significa lo que diga esta tabla. El publicador rechaza lotes incoherentes con ella.';

create table core.season (
  id            smallint    generated always as identity primary key,
  etiqueta      text        not null unique            -- '2026-27'
                  check (etiqueta ~ '^\d{4}-\d{2}$'),
  anio_inicio   smallint    not null,
  orden         smallint    not null
);

create table core.competition (
  id            bigint      generated always as identity primary key,
  federation_id smallint    not null references core.federation(id),
  nombre_canonico text      not null,
  nota_curacion text,
  unique (federation_id, nombre_canonico)
);

comment on table core.competition is
  'Concepto histórico curado a mano. No se deduce de códigos anuales; puede no existir.';

create table core.competition_edition (
  id                bigint   generated always as identity primary key,
  federation_id     smallint not null references core.federation(id),
  season_id         smallint not null references core.season(id),
  competition_id    bigint            references core.competition(id),
  codigo_externo    text     not null,
  nombre_publicado  text     not null,
  ambito            text     not null default 'desconocido'
                      check (ambito in ('nacional','regional','provincial','ascenso','copa','otra','desconocido')),
  modalidad         text     not null default 'desconocida'
                      check (modalidad in ('futbol11','futbol8','futbol7','sala','playa','desconocida')),
  genero            text     not null default 'desconocido'
                      check (genero in ('masculina','femenina','mixta','desconocido')),
  categoria         text     not null default 'desconocida'
                      check (categoria in ('aficionados','juvenil','cadete','infantil','alevin','benjamin','prebenjamin','veteranos','desconocida')),
  provincia         text,
  nivel             smallint,
  estado            text     not null default 'prevista'
                      check (estado in ('prevista','activa','finalizada','cancelada')),
  classification_confidence numeric(3,2) not null default 0
                      check (classification_confidence between 0 and 1),
  clasificacion_curada boolean not null default false,
  visibility_state  text     not null default 'oculta'
                      check (visibility_state in ('oculta','parcial_privada','verificada_hasta_jornada','completa')),
  data_version      bigint   not null default 0,
  unique (federation_id, season_id, codigo_externo)
);

comment on column core.competition_edition.nivel is
  'Ordinal comparable SÓLO dentro de su federación y temporada. Nunca entre federaciones.';

create table core.phase_group (
  id                      bigint   generated always as identity primary key,
  competition_edition_id  bigint   not null references core.competition_edition(id),
  codigo_externo          text     not null,
  nombre                  text     not null,
  tipo                    text     not null default 'liga'
                            check (tipo in ('liga','fase','ascenso','copa','otra')),
  orden                   smallint not null default 0,
  jornadas_previstas      smallint,
  data_version            bigint   not null default 0,
  unique (competition_edition_id, codigo_externo)
);

create table core.matchday (
  id              bigint   generated always as identity primary key,
  phase_group_id  bigint   not null references core.phase_group(id),
  numero          smallint not null,
  codigo_externo  text,
  fecha_prevista  date,
  cerrada         boolean  not null default false,
  unique (phase_group_id, numero)
);

create table core.venue (
  id            bigint   generated always as identity primary key,
  federation_id smallint not null references core.federation(id),
  codigo_externo text,
  nombre        text     not null,
  nombre_norm   text     generated always as (core.normaliza_nombre(nombre)) stored,
  municipio     text,
  unique (federation_id, codigo_externo)
);

-- Toda referencia externa vive aquí, siempre contextualizada. ADR-0002.
create table source.external_ref (
  id            bigint      generated always as identity primary key,
  federation_id smallint    not null references core.federation(id),
  entity_type   text        not null,
  external_id   text        not null,
  context_key   text        not null,
  context_version smallint  not null default 1,
  canonical_id  bigint,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (federation_id, entity_type, external_id, context_key)
);

comment on column source.external_ref.context_key is
  'Ámbito estable y versionado en el que ese external_id es único: por ejemplo '
  '"temporada=2026-27;competicion=123;grupo=456" para un equipo. Nunca se hace JOIN sólo por external_id.';

create index external_ref_canonical_idx
  on source.external_ref(entity_type, canonical_id);

create index edition_filters_idx
  on core.competition_edition(federation_id, season_id, ambito, categoria);

create index edition_visible_idx
  on core.competition_edition(federation_id, season_id)
  where visibility_state <> 'oculta';

create index group_edition_idx
  on core.phase_group(competition_edition_id, orden, id);
