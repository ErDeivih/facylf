-- Catálogo: delegaciones, temporadas y competiciones.
-- Los códigos de la federación viven aquí, NO en el código: cambian cada temporada
-- y así se añaden provincias sin tocar nada.

create table delegaciones (
  id      smallint primary key,          -- código de la federación
  nombre  text not null unique
);

create table temporadas (
  id        smallint primary key,        -- CodTemporada (22 = 2026/27)
  etiqueta  text not null unique,        -- '2026/27'
  activa    boolean not null default false
);

create type categoria as enum (
  'aficionados','juvenil','cadete','infantil','alevin',
  'benjamin','prebenjamin','sala','copa'
);

create table competiciones (
  id             bigserial primary key,
  cod_comp       text not null,
  cod_grupo      text not null,
  temporada_id   smallint not null references temporadas,
  delegacion_id  smallint not null references delegaciones,
  nombre         text not null,
  categoria      categoria not null,
  genero         char(1) not null default 'm' check (genero in ('m','f')),
  slug           text not null unique,
  activa         boolean not null default true,
  creada         timestamptz not null default now(),
  unique (cod_comp, cod_grupo, temporada_id)
);

create index on competiciones (temporada_id, delegacion_id) where activa;

-- Categorías cuyos jugadores son menores. Se consulta desde la aplicación para
-- decidir qué se puede mostrar. Ver 0005_menores.sql.
create or replace function es_de_menores(c categoria) returns boolean
  language sql immutable as $$
    select c in ('juvenil','cadete','infantil','alevin','benjamin','prebenjamin')
  $$;
