-- Clubes y equipos.
-- `nombre_fed` es el literal de la federación, con sus comillas de filial incluidas
-- (`C.D. Munibar Pizarrales "B"`). Es la clave para casar lo que llega del scraper.
-- `nombre` es el que se enseña. Ver skill `parser-federacion`.

create table clubes (
  id      bigserial primary key,
  nombre  text not null,
  slug    text not null unique,
  escudo  text,                            -- ruta en Storage
  color1  text not null default '#CE2028', -- rojo del Pizarrales, por defecto
  color2  text not null default '#16181C'
);

create table equipos (
  id          bigserial primary key,
  club_id     bigint references clubes on delete set null,
  nombre      text not null,
  nombre_fed  text not null,
  -- sufijo de filial extraído del nombre federado: 'B', 'C'... o null.
  -- Se guarda aparte porque la normalización lo pierde y dos equipos del mismo club
  -- en el mismo grupo pasan en categorías bajas.
  filial      char(1),
  slug        text not null unique,
  unique (nombre_fed)
);

create index equipos_busqueda on equipos using gin (to_tsvector('spanish', nombre_fed));

create table equipos_competicion (
  equipo_id       bigint not null references equipos on delete cascade,
  competicion_id  bigint not null references competiciones on delete cascade,
  primary key (equipo_id, competicion_id)
);
