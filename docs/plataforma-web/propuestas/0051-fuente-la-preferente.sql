-- PROPUESTA (no es una migración aplicada ni está en infra/migraciones). Claude, 25/10/2026.
-- Ver docs/plataforma-web/LA-PREFERENTE-PLAN-2026-10-25.md §4. DeepSeek la revisa, la numera y la pasa a
-- infra/migraciones cuando David dé el visto bueno. Aditiva: no toca 0001-0050.
--
-- Idea: La Preferente (LP) es una FUENTE SECUNDARIA. Lo suyo se guarda aparte (esquema `externo`), se empareja con
-- los grupos de la federación y sólo se PROYECTA al canónico lo que la federación no tiene (todavía o nunca).
-- Cuando llega el dato de la federación, manda la federación y lo de LP se queda para contrastar.

create schema if not exists externo;

-- 1. Lo leído de La Preferente, tal cual (claves de LP) --------------------------------------------------------
create table externo.lp_competicion (
  id              integer     primary key,          -- C{id}
  linea_id        integer,                          -- gr={línea}: la misma competición a lo largo de las temporadas
  temporada       text        not null check (temporada ~ '^\d{4}-\d{2}$'),
  ccaa_lp         smallint    not null,             -- IDccaa de LP (8 = Castilla y León…)
  deporte         text        not null check (deporte in ('futbol','sala','playa','baloncesto')),
  categoria_lp    smallint,                         -- 1 sénior, 2 juvenil, 3 cadete, 4 infantil… (ver el plan §2)
  nombre          text        not null,
  division        text,
  grupo           text,
  nacional        boolean     not null default false,
  federation_id   smallint    references core.federation(id),   -- a qué federación corresponde (null = nacional)
  calendario_leido_en timestamptz,
  visto_en        timestamptz not null default now()
);

create table externo.lp_partido (
  clave           text        primary key,          -- P{id} si tiene ficha; si no, «{comp}|{jornada}|{local}|{visitante}»
  partido_id      bigint,                           -- P{id}
  competicion_id  integer     not null references externo.lp_competicion(id),
  jornada         smallint    not null,
  fecha           date,
  local_id        integer,  local_nombre     text not null,
  visitante_id    integer,  visitante_nombre text not null,
  goles_local     smallint, goles_visitante  smallint,      -- NULL = sin resultado (nunca 0 por defecto)
  marcador_texto  text,                             -- «Aplaz.», «Susp.»…
  ficha_disponible boolean    not null default false,
  ficha_leida_en  timestamptz,
  estadio_lp_id   integer, estadio text,
  arbitro_lp_id   integer, arbitro text, arbitro_delegacion text
);
create index on externo.lp_partido (competicion_id, jornada);

create table externo.lp_participacion (
  partido_clave   text        not null references externo.lp_partido(clave),
  equipo_lp_id    integer     not null,
  condicion       text        not null check (condicion in ('titular','suplente','tecnico')),
  orden           smallint    not null,
  jugador_lp_id   integer,                          -- J{id}: el mismo en todas las temporadas y comunidades
  alias           text, nombre text, dorsal smallint, rol text,
  menores         boolean     not null default false,
  primary key (partido_clave, equipo_lp_id, condicion, orden)
);

create table externo.lp_evento (
  partido_clave   text        not null references externo.lp_partido(clave),
  orden           smallint    not null,
  tipo            text        not null check (tipo in ('gol','amarilla','roja','cambio')),
  minuto          smallint,
  equipo_lp_id    integer,
  jugador_lp_id   integer,                          -- en un cambio, el que SALE
  entra_lp_id     integer,                          -- sólo en cambios
  primary key (partido_clave, orden)
);
comment on column externo.lp_evento.tipo is
  'LP pone la doble amarilla como «roja» con su propia fila: al contrastar con la federación se normaliza.';

-- 2. El emparejado con la federación --------------------------------------------------------------------------
create table externo.lp_emparejado (
  competicion_id  integer     primary key references externo.lp_competicion(id),
  phase_group_id  bigint      references core.phase_group(id),   -- null = la federación no lo tiene
  estado          text        not null check (estado in ('emparejado','sin_contraparte','dudoso','pendiente')),
  cobertura       numeric(3,2), comparables integer, coinciden integer, parte numeric(4,3),
  equipos         jsonb       not null default '{}'::jsonb,       -- nombre LP → nombre federación (+ parecido)
  diferencias     jsonb       not null default '[]'::jsonb,       -- marcadores que no cuadran (para revisar)
  calculado_en    timestamptz not null default now()
);

-- 3. Procedencia en el canónico (sólo para lo proyectado desde LP) -----------------------------------------------
alter table core.competition_edition
  add column if not exists origen text not null default 'federacion'
    check (origen in ('federacion','lapreferente')),
  add column if not exists reemplazada_por bigint references core.competition_edition(id);
comment on column core.competition_edition.origen is
  '«lapreferente» = edición creada desde La Preferente porque la federación no la tiene (todavía o nunca). '
  'Se muestra con la marca «dato no oficial». Cuando llega la de la federación y se empareja, '
  'reemplazada_por apunta a ella y la de LP deja de mostrarse.';
