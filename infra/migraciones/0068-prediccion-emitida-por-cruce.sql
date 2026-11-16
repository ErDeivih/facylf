-- 0068 · Predicción congelada de un cruce que todavía no es partido.
--
-- Por qué: el registro de aciertos (0064) congela la predicción de los partidos PENDIENTES que tienen
-- fila en `core.match`. Pero el canónico no tiene fila de un partido hasta la noche en que se juega, casi
-- siempre ya con resultado: no hay un momento «antes» en el que congelar, y el registro no se llena.
--
-- Con el calendario previsto (0067) sí lo hay. Aquí se guarda la predicción de cada cruce de los
-- próximos días tal como se emite; cuando el partido aparece en `core.match`, `05-registro.mjs` la pasa
-- a `analytics.prediccion_emitida` con su fecha de emisión original y a partir de ahí todo sigue igual.
--
-- La clave es el cruce (grupo, local, visitante), no un partido: aún no existe.
-- Reversible: `drop table analytics.prediccion_emitida_cruce`.

create table analytics.prediccion_emitida_cruce (
  phase_group_id      bigint   not null references core.phase_group(id) on delete cascade,
  home_team_entry_id  bigint   not null references core.team_entry(id) on delete cascade,
  away_team_entry_id  bigint   not null references core.team_entry(id) on delete cascade,
  jornada             smallint not null,
  fecha_prevista      date,
  emitida_en          timestamptz not null default now(),
  modelo              text     not null,
  prob_local          numeric(5,2) not null check (prob_local between 0 and 100),
  prob_empate         numeric(5,2) not null check (prob_empate between 0 and 100),
  prob_visitante      numeric(5,2) not null check (prob_visitante between 0 and 100),
  marcador_probable   text,
  prob_marcador       numeric(5,2),
  primary key (phase_group_id, home_team_entry_id, away_team_entry_id)
);

comment on table analytics.prediccion_emitida_cruce is
  'Predicción de un cruce del calendario previsto, congelada antes de jugarse. No se reescribe; pasa a analytics.prediccion_emitida cuando el partido existe.';

grant select on analytics.prediccion_emitida_cruce to facylf_lector;
grant select, insert, update, delete on analytics.prediccion_emitida_cruce to facylf_publicador;
