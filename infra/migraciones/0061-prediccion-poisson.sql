-- 0061 · Predicción de marcadores por Poisson (fuerza, media de liga y ventaja de casa).
--
-- Por qué: la web enseña resultados, pero no una expectativa previa de cada partido. Este modelo estima,
-- con los partidos que ya están en el canónico, la fuerza de ataque y defensa de cada equipo dentro de su
-- liga, la media de goles de esa liga y la ventaja de jugar en casa; de ahí sale la matriz de marcadores
-- 0-0…5-5 y los porcentajes 1-X-2. Es un dato DERIVADO y revisable: no toca `core` ni sustituye a nada.
--
-- Todo va en `analytics` (dato derivado, no canónico). Aditiva y reversible: `drop table` de las tres
-- tablas se lleva sólo la predicción; se vuelve a poblar con `node scripts/prediccion/01-parametros.mjs`
-- y `node scripts/prediccion/02-predicciones.mjs`.
--
-- El método y sus fuentes están en `INFORMES/PREDICCION-POISSON.md`.

-- 1 · Parámetros de la liga (una fila por edición de competición: federación + temporada + competición).
create table analytics.poisson_liga (
  competition_edition_id bigint primary key references core.competition_edition(id) on delete cascade,
  season_id             smallint not null references core.season(id),
  -- Partidos con marcador usados para estimar la media y la ventaja de casa.
  partidos              integer  not null check (partidos >= 0),
  -- Goles por partido del equipo local y del visitante; `media_total` es la suma de las dos.
  media_local           numeric(6,4) not null check (media_local >= 0),
  media_visitante       numeric(6,4) not null check (media_visitante >= 0),
  media_total           numeric(6,4) not null check (media_total >= 0),
  -- media_local / media_visitante. 1,00 = no hay ventaja de casa; >1 = el local marca más.
  ventaja_casa          numeric(6,4) not null check (ventaja_casa > 0),
  -- Ventana usada, para poder auditar el cálculo: p. ej. '2025-26+2026-27'.
  temporadas            text not null,
  calculado_en          timestamptz not null default now()
);

comment on table analytics.poisson_liga is
  'Media de goles y ventaja de casa por edición de competición, estimadas con partidos con marcador. Dato derivado; no es canónico.';
comment on column analytics.poisson_liga.media_local is
  'Goles por partido del equipo local en esta liga (los partidos sin marcador no cuentan).';
comment on column analytics.poisson_liga.ventaja_casa is
  'Cociente media_local/media_visitante. Se usa para separar los goles esperados del local y del visitante.';

-- 2 · Fuerza de ataque y defensa por equipo y edición. La clave es la inscripción (`team_season`), porque
-- un club puede tener varios equipos (A, B, C) en la misma temporada; `club_id` queda para enlazar la
-- misma entidad entre temporadas cuando se mezcla la temporada anterior con la actual.
create table analytics.poisson_equipo (
  competition_edition_id bigint  not null references core.competition_edition(id) on delete cascade,
  team_season_id         bigint  not null references core.team_season(id) on delete cascade,
  club_id                bigint  not null references core.club(id),
  season_id              smallint not null references core.season(id),
  partidos               integer not null check (partidos >= 0),
  goles_favor            integer not null check (goles_favor >= 0),
  goles_contra           integer not null check (goles_contra >= 0),
  -- Multiplicadores relativos a la media de la liga. 1,00 = equipo medio.
  ataque                 numeric(6,4) not null check (ataque > 0),
  defensa                numeric(6,4) not null check (defensa > 0),
  -- Partidos de la temporada anterior del mismo club usados en la mezcla (0 si no había).
  partidos_previos       integer not null default 0 check (partidos_previos >= 0),
  calculado_en           timestamptz not null default now(),
  primary key (competition_edition_id, team_season_id)
);

comment on table analytics.poisson_equipo is
  'Fuerza de ataque y defensa por inscripción y edición, relativa a la media de su liga y encogida hacia 1 con pocos partidos.';
comment on column analytics.poisson_equipo.ataque is
  'Goles a favor por partido divididos por la media de goles por equipo de la liga (encogido hacia 1,00).';
comment on column analytics.poisson_equipo.defensa is
  'Goles en contra por partido divididos por la media de goles por equipo de la liga (encogido hacia 1,00); más alto = peor defensa.';

-- 3 · Predicción por partido: lambdas, matriz 0-0…5-5, 1-X-2 y marcador más probable.
create table analytics.poisson_partido (
  match_id                 bigint primary key references core.match(id) on delete cascade,
  competition_edition_id   bigint not null references core.competition_edition(id) on delete cascade,
  goles_esperados_local    numeric(6,4) not null check (goles_esperados_local > 0),
  goles_esperados_visitante numeric(6,4) not null check (goles_esperados_visitante > 0),
  -- Porcentajes 0-100, calculados sobre la matriz 0-0…5-5 normalizada (la cola por encima de 5 goles
  -- se reparte proporcionalmente; ver el informe). Suman 100,00 ± 0,02.
  prob_local               numeric(5,2) not null check (prob_local between 0 and 100),
  prob_empate              numeric(5,2) not null check (prob_empate between 0 and 100),
  prob_visitante           numeric(5,2) not null check (prob_visitante between 0 and 100),
  marcador_probable        text    not null check (marcador_probable ~ '^[0-5]-[0-5]$'),
  prob_marcador            numeric(5,2) not null check (prob_marcador between 0 and 100),
  -- Las 36 celdas con su probabilidad sin redondear a porcentaje (0..1), para poder recalcular.
  matriz                   jsonb   not null,
  modelo                   text    not null default 'poisson-v1',
  calculado_en             timestamptz not null default now()
);

comment on table analytics.poisson_partido is
  'Predicción 1-X-2 y marcador más probable por partido, con la matriz 0-0…5-5 que la origina. Dato derivado, no canónico.';
comment on column analytics.poisson_partido.matriz is
  'Objeto {"local-visitante": probabilidad} para los marcadores 0-0 a 5-5, normalizado a suma 1.';

create index poisson_partido_edicion on analytics.poisson_partido (competition_edition_id);

-- La web lee con facylf_lector; los scripts escriben con facylf_publicador (mismo patrón que el resto
-- de tablas derivadas de `analytics`).
grant select on analytics.poisson_liga, analytics.poisson_equipo, analytics.poisson_partido to facylf_lector;
grant select, insert, update, delete on analytics.poisson_liga, analytics.poisson_equipo, analytics.poisson_partido to facylf_publicador;
