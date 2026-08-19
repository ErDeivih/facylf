-- Partidos.
-- Dos resultados separados a propósito: el **oficial** (federación) y el **en vivo**
-- (la gente). El oficial siempre gana; en cuanto llega, el vivo deja de mostrarse.

create type estado_partido as enum ('programado','jugando','descanso','final','oficial');

create table partidos (
  id              bigserial primary key,
  competicion_id  bigint not null references competiciones on delete cascade,
  jornada         smallint not null check (jornada between 1 and 60),
  -- fecha de la jornada según la federación: siempre domingo, aunque el partido se
  -- juegue el sábado. Se corrige cuando aparece el horario real.
  fecha_jornada   date,
  fecha           date,
  hora            time,
  campo           text,
  local_id        bigint not null references equipos,
  visitante_id    bigint not null references equipos,

  goles_local_oficial      smallint check (goles_local_oficial >= 0),
  goles_visitante_oficial  smallint check (goles_visitante_oficial >= 0),

  goles_local_vivo         smallint check (goles_local_vivo >= 0),
  goles_visitante_vivo     smallint check (goles_visitante_vivo >= 0),
  confianza                smallint not null default 0 check (confianza between 0 and 100),

  estado          estado_partido not null default 'programado',
  minuto          smallint,
  actualizado     timestamptz not null default now(),

  constraint no_juega_contra_si_mismo check (local_id <> visitante_id),
  unique (competicion_id, jornada, local_id, visitante_id)
);

create index on partidos (fecha, competicion_id);
create index on partidos (competicion_id, jornada);
create index partidos_en_juego on partidos (estado) where estado in ('jugando','descanso');

-- Sanciones de puntos del comité. No vienen en el calendario: si nuestra tabla no
-- cuadra con la oficial, casi siempre es esto.
create table sanciones (
  id              bigserial primary key,
  competicion_id  bigint not null references competiciones on delete cascade,
  equipo_id       bigint not null references equipos,
  puntos          smallint not null check (puntos > 0),
  motivo          text,
  creada          timestamptz not null default now()
);

create or replace function toca_actualizado() returns trigger
  language plpgsql as $$ begin new.actualizado = now(); return new; end $$;

create trigger partidos_actualizado before update on partidos
  for each row execute function toca_actualizado();
