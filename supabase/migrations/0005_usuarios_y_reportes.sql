-- Usuarios, reportes desde el campo y reputación. Ver PROYECTO.md §6.

create type rol_usuario as enum ('usuario','delegado','moderador','admin');

create table usuarios (
  id          uuid primary key references auth.users on delete cascade,
  alias       text not null unique check (length(alias) between 3 and 24),
  club_id     bigint references clubes on delete set null,
  reputacion  smallint not null default 0,
  verificado  boolean not null default false,
  rol         rol_usuario not null default 'usuario',
  -- Registro cerrado a mayores de 16 para reportar y chatear (LOPDGDD art. 7).
  -- Los menores pueden mirar, sin cuenta.
  mayor_de_16 boolean not null default false,
  creado      timestamptz not null default now()
);

-- Un club puede reclamar sus equipos: el delegado tiene prioridad y puede corregir.
create table delegados (
  usuario_id  uuid not null references usuarios on delete cascade,
  equipo_id   bigint not null references equipos on delete cascade,
  confirmado  boolean not null default false,
  primary key (usuario_id, equipo_id)
);

create table reportes (
  id          bigserial primary key,
  partido_id  bigint not null references partidos on delete cascade,
  usuario_id  uuid not null references usuarios on delete cascade,
  goles_local      smallint not null check (goles_local between 0 and 30),
  goles_visitante  smallint not null check (goles_visitante between 0 and 30),
  minuto      smallint,
  estado      estado_partido,
  creado      timestamptz not null default now(),
  descartado  boolean not null default false,
  -- un reporte por persona y partido: se edita, no se duplica
  unique (partido_id, usuario_id)
);

create index on reportes (partido_id, creado desc);

-- Nadie está en seis campos a la vez.
create or replace function limite_reportes_por_jornada() returns trigger
  language plpgsql as $$
declare n integer;
begin
  select count(distinct r.partido_id) into n
    from reportes r join partidos p on p.id = r.partido_id
   where r.usuario_id = new.usuario_id
     and p.jornada = (select jornada from partidos where id = new.partido_id)
     and p.competicion_id = (select competicion_id from partidos where id = new.partido_id);
  if n >= 6 then
    raise exception 'límite de 6 partidos reportados por persona y jornada';
  end if;
  return new;
end $$;

create trigger reportes_limite before insert on reportes
  for each row execute function limite_reportes_por_jornada();

-- No se reporta un partido que aún no ha empezado.
create or replace function reporte_no_anticipado() returns trigger
  language plpgsql as $$
declare cuando timestamptz;
begin
  select (p.fecha + coalesce(p.hora, time '00:00')) at time zone 'Europe/Madrid'
    into cuando from partidos p where p.id = new.partido_id;
  if cuando is not null and now() < cuando then
    raise exception 'ese partido todavía no ha empezado';
  end if;
  return new;
end $$;

create trigger reportes_no_anticipados before insert or update on reportes
  for each row execute function reporte_no_anticipado();
