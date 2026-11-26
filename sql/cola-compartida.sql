-- Cola compartida para varias máquinas (diseño de Claude, 25/11/2026; probado el 26/11/2026).
--
-- El problema que resuelve: hoy cada navegador lleva su copia de la cola en SQLite, así que no se ven entre
-- ellos. Dos que toquen la misma competición piden las mismas páginas. Compartir un SQLite no vale: se
-- serializan y el ritmo baja a un tercio (medido: 348/h frente a 1.020/h).
--
-- Aquí cada trabajo se reclama con UNA sentencia (`UPDATE ... RETURNING`), y el alquiler caduca solo si la
-- máquina muere. Dos máquinas no pueden tener la misma fila ni la misma competición a la vez.
create schema if not exists ops;

create table if not exists ops.cola (
  id           bigserial primary key,
  clave        text not null unique,             -- tipo|temporada|competicion|grupo|jornada|acta
  tipo         text not null,
  temporada    text,
  competicion  text,
  grupo        text,
  jornada      text,
  acta         text,
  url          text,
  prioridad    bigint not null default 0,
  estado       text not null default 'pendiente', -- pendiente | en_curso | hecho | fallido
  intentos     integer not null default 0,
  dueno        text,                              -- máquina que la tiene alquilada
  alquiler_hasta timestamptz,                     -- cuándo caduca el alquiler
  siguiente_intento timestamptz,
  ultimo_error text,
  creado_en    timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists cola_elegible on ops.cola (prioridad, id)
  where estado = 'pendiente';
create index if not exists cola_competicion on ops.cola (temporada, competicion, estado);
create index if not exists cola_dueno on ops.cola (dueno) where dueno is not null;

-- Una competición por máquina: si otra la tiene alquilada, no se puede reclamar.
create table if not exists ops.competicion_alquiler (
  temporada   text not null,
  competicion text not null,
  dueno       text not null,
  alquiler_hasta timestamptz not null,
  primary key (temporada, competicion)
);
