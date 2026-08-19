-- Goles.
--
-- REGLA QUE NO SE NEGOCIA (CLAUDE.md, PROYECTO.md §9): en categorías de menores se
-- guarda **dorsal, nunca nombre**. `jugador` sólo se rellena si el club ha confirmado
-- por escrito que tiene el consentimiento de los tutores, y eso queda registrado en
-- `consentimientos`. La base de datos lo impone; no se deja a criterio de la interfaz.

create table consentimientos (
  id              bigserial primary key,
  club_id         bigint not null references clubes on delete cascade,
  competicion_id  bigint not null references competiciones on delete cascade,
  -- quién lo confirmó, cuándo y cómo. Sin esto no hay nombres.
  confirmado_por  text not null,
  documento       text,
  creado          timestamptz not null default now(),
  unique (club_id, competicion_id)
);

create type tipo_gol as enum ('gol','penalti','propia');

create table goles (
  id             bigserial primary key,
  partido_id     bigint not null references partidos on delete cascade,
  equipo_id      bigint not null references equipos,
  minuto         smallint check (minuto between 0 and 130),
  dorsal         smallint check (dorsal between 1 and 99),
  jugador        text,
  tipo           tipo_gol not null default 'gol',
  reportado_por  uuid references usuarios on delete set null,
  confirmado     boolean not null default false,
  creado         timestamptz not null default now()
);

create index on goles (partido_id);

create or replace function jugador_solo_con_consentimiento() returns trigger
  language plpgsql as $$
declare menores boolean; hay_consentimiento boolean;
begin
  if new.jugador is null then return new; end if;

  select es_de_menores(c.categoria) into menores
    from partidos p join competiciones c on c.id = p.competicion_id
   where p.id = new.partido_id;

  if not menores then return new; end if;

  select exists (
    select 1 from consentimientos co
      join equipos eq on eq.club_id = co.club_id
      join partidos p on p.id = new.partido_id
     where eq.id = new.equipo_id and co.competicion_id = p.competicion_id
  ) into hay_consentimiento;

  if not hay_consentimiento then
    raise exception 'categoría de menores sin consentimiento registrado: usa el dorsal, no el nombre';
  end if;
  return new;
end $$;

create trigger goles_sin_nombres_de_menores before insert or update on goles
  for each row execute function jugador_solo_con_consentimiento();
