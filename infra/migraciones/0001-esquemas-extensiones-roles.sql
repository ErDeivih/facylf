-- 0001 · Esquemas, extensiones, roles y registro de migraciones.
-- Ver docs/plataforma-web/MODELO-DATOS.md §2 y docs/plataforma-web/ENTORNO-LOCAL.md §3.

create schema if not exists source;     -- lotes, referencias externas, trazabilidad
create schema if not exists core;       -- entidades y hechos normalizados
create schema if not exists analytics;  -- agregados y proyecciones para la web
create schema if not exists ops;        -- publicación, cobertura, auditoría

create extension if not exists pg_trgm;
create extension if not exists unaccent;
create extension if not exists pg_stat_statements;

create table if not exists ops.migracion (
  numero       integer     primary key,
  nombre       text        not null,
  hash         text        not null,
  aplicada_en  timestamptz not null default now()
);

-- Roles. Las contraseñas se asignan fuera de la migración (ALTER ROLE ... PASSWORD),
-- para no dejarlas escritas en el repositorio.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'facylf_lector') then
    create role facylf_lector login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'facylf_publicador') then
    create role facylf_publicador login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

grant usage on schema core, analytics to facylf_lector;
grant usage on schema source, core, analytics, ops to facylf_publicador;

-- La web sólo lee. Un INSERT desde apps/web debe fallar con error de permisos.
alter default privileges in schema core, analytics
  grant select on tables to facylf_lector;
alter default privileges in schema source, core, analytics, ops
  grant select, insert, update, delete on tables to facylf_publicador;
alter default privileges in schema source, core, analytics, ops
  grant usage, select on sequences to facylf_publicador;

-- Normalización de nombres para búsqueda: determinista e inmutable, para poder indexarla.
create or replace function core.normaliza_nombre(texto text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select regexp_replace(
           lower(public.unaccent('public.unaccent', texto)),
           '[^a-z0-9]+', ' ', 'g')
$$;

comment on function core.normaliza_nombre(text) is
  'Clave auxiliar de búsqueda: minúsculas, sin diacríticos, puntuación colapsada a espacio. '
  'El literal original de la fuente se conserva siempre aparte y es el que se muestra.';
