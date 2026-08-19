-- Chat de partido. Fase 3, no fase 1 (PROYECTO.md §7).
-- La tabla existe desde ya para no migrar con datos encima, pero la RLS la deja
-- cerrada hasta que haya moderadores de verdad.

create table mensajes (
  id             bigserial primary key,
  partido_id     bigint not null references partidos on delete cascade,
  usuario_id     uuid not null references usuarios on delete cascade,
  texto          text not null check (length(texto) between 1 and 500),
  creado         timestamptz not null default now(),
  oculto         boolean not null default false,
  motivo_oculto  text
);

create index on mensajes (partido_id, creado desc);

create table denuncias (
  mensaje_id  bigint not null references mensajes on delete cascade,
  usuario_id  uuid not null references usuarios on delete cascade,
  motivo      text,
  creada      timestamptz not null default now(),
  primary key (mensaje_id, usuario_id)
);

-- Tres denuncias ocultan el mensaje hasta revisión.
create or replace function oculta_por_denuncias() returns trigger
  language plpgsql as $$
begin
  if (select count(*) from denuncias where mensaje_id = new.mensaje_id) >= 3 then
    update mensajes set oculto = true, motivo_oculto = 'denunciado por varias personas'
     where id = new.mensaje_id;
  end if;
  return new;
end $$;

create trigger denuncias_ocultan after insert on denuncias
  for each row execute function oculta_por_denuncias();

-- Ventana: desde 1 h antes hasta 3 h después. Un chat permanente por partido se
-- convierte en un foro sin dueño.
create or replace function mensaje_en_ventana() returns trigger
  language plpgsql as $$
declare inicio timestamptz;
begin
  select (p.fecha + coalesce(p.hora, time '00:00')) at time zone 'Europe/Madrid'
    into inicio from partidos p where p.id = new.partido_id;
  if inicio is null then raise exception 'ese partido no tiene hora todavía'; end if;
  if now() < inicio - interval '1 hour' or now() > inicio + interval '3 hours' then
    raise exception 'el chat de ese partido está cerrado';
  end if;
  return new;
end $$;

create trigger mensajes_ventana before insert on mensajes
  for each row execute function mensaje_en_ventana();
