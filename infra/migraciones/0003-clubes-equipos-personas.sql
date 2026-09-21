-- 0003 · Club, equipo-temporada, inscripción y personas con identidad reversible.
-- Ver MODELO-DATOS.md §3 y §5. ADR-0003.

create table core.club (
  id              bigint   generated always as identity primary key,
  federation_id   smallint not null references core.federation(id),
  nombre_canonico text     not null,
  nombre_norm     text     generated always as (core.normaliza_nombre(nombre_canonico)) stored,
  municipio       text,
  provincia       text,
  data_version    bigint   not null default 0
);

create index club_nombre_trgm_idx on core.club using gin (nombre_norm gin_trgm_ops);

create table core.team_season (
  id            bigint   generated always as identity primary key,
  club_id       bigint   not null references core.club(id),
  season_id     smallint not null references core.season(id),
  nombre        text     not null,          -- 'C.D. Ribert Juvenil A'
  nombre_norm   text     generated always as (core.normaliza_nombre(nombre)) stored,
  categoria     text     not null default 'desconocida',
  genero        text     not null default 'desconocido',
  data_version  bigint   not null default 0,
  unique (club_id, season_id, nombre)
);

comment on table core.team_season is
  'El equipo exacto de un club en una temporada. "Ribert Juvenil A" y "Ribert Alevín" comparten '
  'club y NUNCA plantilla ni estadísticas. No existe una "plantilla de club".';

create table core.team_entry (
  id                      bigint not null generated always as identity primary key,
  team_season_id          bigint not null references core.team_season(id),
  phase_group_id          bigint not null references core.phase_group(id),
  codigo_externo          text,
  nombre_en_fuente        text   not null,
  retirado                boolean not null default false,
  unique (team_season_id, phase_group_id)
);

comment on table core.team_entry is
  'Inscripción de un equipo-temporada en un grupo. Liga y copa son dos team_entry del mismo team_season.';

create index team_entry_grupo_idx on core.team_entry(phase_group_id, id);

create table core.team_alias (
  id             bigint   generated always as identity primary key,
  team_season_id bigint   not null references core.team_season(id),
  federation_id  smallint not null references core.federation(id),
  literal        text     not null,
  literal_norm   text     generated always as (core.normaliza_nombre(literal)) stored,
  visto_desde    date,
  visto_hasta    date,
  unique (team_season_id, federation_id, literal)
);

-- Personas -------------------------------------------------------------------

create table core.person (
  id            bigint      generated always as identity primary key,
  nombre_mostrado text      not null,
  nombre_norm   text        generated always as (core.normaliza_nombre(nombre_mostrado)) stored,
  es_menor      boolean     not null default false,
  creada_en     timestamptz not null default now(),
  data_version  bigint      not null default 0
);

comment on column core.person.es_menor is
  'Marca de tratamiento restringido. Ver SEGURIDAD-OPERACION.md §5: no indexable, sin ranking '
  'público y sin búsqueda nominal global.';

create index person_nombre_trgm_idx on core.person using gin (nombre_norm gin_trgm_ops);

create table core.person_source_identity (
  id             bigint   generated always as identity primary key,
  person_id      bigint   not null references core.person(id),
  federation_id  smallint not null references core.federation(id),
  codigo_externo text,
  context_key    text     not null default '',
  primera_acta   text,
  ultima_acta    text,
  unique (federation_id, codigo_externo, context_key)
);

comment on table core.person_source_identity is
  'El código federativo da identidad fuerte SÓLO dentro de su federación y su contexto.';

create table core.person_name (
  id           bigint generated always as identity primary key,
  person_id    bigint not null references core.person(id),
  literal      text   not null,
  literal_norm text   generated always as (core.normaliza_nombre(literal)) stored,
  es_apodo     boolean not null default false,
  visto_desde  date,
  visto_hasta  date,
  unique (person_id, literal)
);

comment on table core.person_name is
  'Un apodo NUNCA se expande a un nombre real que la fuente no publique.';

create table core.identity_candidate (
  id             bigint      generated always as identity primary key,
  person_a       bigint      not null references core.person(id),
  person_b       bigint      not null references core.person(id),
  score          numeric(4,3) not null check (score between 0 and 1),
  margen         numeric(4,3),              -- distancia al segundo candidato
  features_json  jsonb       not null default '{}'::jsonb,
  model_version  text        not null,
  estado         text        not null default 'pendiente'
                   check (estado in ('pendiente','propuesto','descartado','resuelto')),
  creado_en      timestamptz not null default now(),
  check (person_a < person_b),
  unique (person_a, person_b, model_version)
);

create index identity_candidate_pendiente_idx
  on core.identity_candidate(score desc, id)
  where estado in ('pendiente','propuesto');

create table core.identity_decision (
  id          bigint      generated always as identity primary key,
  person_a    bigint      not null references core.person(id),
  person_b    bigint      not null references core.person(id),
  decision    text        not null check (decision in ('unir','separar')),
  autor       text        not null,
  motivo      text        not null,
  decidida_en timestamptz not null default now(),
  revertida_en timestamptz,
  check (person_a < person_b)
);

comment on table core.identity_decision is
  'Las decisiones son reversibles: no se reescriben las apariciones, se cambia el enlace canónico. '
  'Dos nombres iguales sin evidencia suficiente permanecen separados.';
