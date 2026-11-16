-- 0067 · Calendario previsto: los cruces de todas las jornadas, jugadas o no.
--
-- Por qué: `core.match` sólo tiene fila para las jornadas que el recolector ya ha visitado, y el
-- recolector no visita una jornada hasta la noche en que se juega (`disponibleTrasJornada`). Por eso en
-- noviembre un grupo de 34 jornadas tiene 10 en la base: «Próximos partidos» sale vacía y la simulación
-- de la clasificación final no tiene qué simular.
--
-- El calendario completo sí está descargado: cada grupo guarda `calendario.html.gz` (la página
-- `NFG_VisCalendario_Vis`, con las 34 jornadas) y nadie lo leía. `scripts/calendario-desde-html.mjs` lo
-- lee del disco, sin pedir nada al portal, y lo deja aquí.
--
-- Va en tabla aparte y no en `core.match` a propósito:
--   · `core.match` lo escribe el importador, con su lote, su procedencia y sus comprobaciones; un guion
--     que añade filas por su cuenta rompería esa garantía;
--   · un cruce previsto no es un partido: no tiene acta, ni estado oficial, ni hora confirmada, y la
--     federación lo puede mover. Cuando la jornada se juega, el importador crea el partido de verdad y
--     esta fila deja de usarse (las consultas descartan el cruce que ya tiene partido).
--
-- Reversible: `drop table core.calendario_previsto` se lleva sólo el calendario previsto.

create table core.calendario_previsto (
  phase_group_id      bigint   not null references core.phase_group(id) on delete cascade,
  jornada             smallint not null check (jornada > 0),
  -- Posición del cruce dentro de la jornada, en el orden en que lo publica la federación.
  orden               smallint not null check (orden > 0),
  home_team_entry_id  bigint   not null references core.team_entry(id) on delete cascade,
  away_team_entry_id  bigint   not null references core.team_entry(id) on delete cascade,
  -- Fecha de la jornada según el calendario. Es la fecha oficial de la jornada, no la de cada partido:
  -- un partido puede jugarse el sábado de una jornada fechada en domingo. `null` si no la publica.
  fecha_prevista      date,
  -- Huella del `calendario.html` del que salió, para no reescribir lo que no ha cambiado.
  sha256              text     not null check (sha256 ~ '^[0-9a-f]{64}$'),
  observado_en        timestamptz not null default now(),
  primary key (phase_group_id, jornada, orden),
  check (home_team_entry_id <> away_team_entry_id)
);

create index calendario_previsto_fecha_idx on core.calendario_previsto (fecha_prevista, phase_group_id);
create index calendario_previsto_local_idx on core.calendario_previsto (home_team_entry_id);
create index calendario_previsto_visitante_idx on core.calendario_previsto (away_team_entry_id);

comment on table core.calendario_previsto is
  'Cruces de cada jornada según la página de calendario archivada del grupo. Complementa a core.match con las jornadas que aún no se han visitado; no lo sustituye.';
comment on column core.calendario_previsto.fecha_prevista is
  'Fecha oficial de la jornada en el calendario; no es la fecha ni la hora confirmada de cada partido.';

grant select on core.calendario_previsto to facylf_lector;
grant select, insert, update, delete on core.calendario_previsto to facylf_publicador;

-- Los cruces previstos que todavía no tienen partido en core.match. Es lo que leen la web y la simulación.
create view core.calendario_pendiente as
select c.phase_group_id, c.jornada, c.orden, c.home_team_entry_id, c.away_team_entry_id, c.fecha_prevista
  from core.calendario_previsto c
 where not exists (
         select 1 from core.match m
          where m.phase_group_id = c.phase_group_id
            and m.home_team_entry_id = c.home_team_entry_id
            and m.away_team_entry_id = c.away_team_entry_id);

comment on view core.calendario_pendiente is
  'Cruces del calendario previsto sin fila en core.match: lo que queda por jugar y aún no se ha recogido.';

grant select on core.calendario_pendiente to facylf_lector, facylf_publicador;
