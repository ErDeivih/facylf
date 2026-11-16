-- 0062 · Clasificación final estimada por Monte Carlo.
--
-- Por qué: la clasificación enseña lo jugado; para saber qué puede pasar en las jornadas que quedan hace
-- falta simular los partidos pendientes con la fuerza de cada equipo, su forma reciente y la ventaja de
-- casa, y contar cuántas veces acaba cada equipo en cada puesto.
--
-- Dato derivado y reversible: vive en `analytics`, no toca `core`. Se puede borrar y recalcular con
-- `node scripts/prediccion/03-simulacion.mjs` sin perder nada canónico.

create table analytics.simulacion_final (
  phase_group_id    bigint  not null references core.phase_group(id) on delete cascade,
  team_entry_id     bigint  not null references core.team_entry(id) on delete cascade,
  -- Media de la posición final en las simulaciones (1 = primero).
  posicion_esperada numeric(6,3) not null check (posicion_esperada >= 1),
  -- Media de puntos al final de la temporada.
  puntos_medios     numeric(6,2) not null check (puntos_medios >= 0),
  -- Porcentaje (0-100) de veces que el equipo acaba en cada posición: [P1, P2, …, PN].
  prob_posiciones   jsonb   not null,
  equipos           smallint not null check (equipos > 0),
  simulaciones      integer not null check (simulaciones > 0),
  calculado_en      timestamptz not null default now(),
  primary key (phase_group_id, team_entry_id)
);

comment on table analytics.simulacion_final is
  'Clasificación final esperada por grupo: posición media, puntos medios y probabilidad de cada puesto (Monte Carlo sobre los partidos que quedan).';
comment on column analytics.simulacion_final.prob_posiciones is
  'Array JSON de longitud equipos: porcentaje de simulaciones en que el equipo acaba 1.º, 2.º, … N.º.';

create index simulacion_final_grupo_posicion on analytics.simulacion_final (phase_group_id, posicion_esperada);

grant select on analytics.simulacion_final to facylf_lector;
grant select, insert, update, delete on analytics.simulacion_final to facylf_publicador;
