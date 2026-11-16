-- 0064 · Registro de aciertos: predicción congelada y resultado real.
--
-- La predicción se guarda al emitirse y no se reescribe; cuando el partido termina se compara con el
-- resultado. Es la base del informe de jornada y del histórico por temporada (sección 12 del plan).

create table analytics.prediccion_emitida (
  match_id       bigint primary key references core.match(id) on delete cascade,
  emitida_en     timestamptz not null default now(),
  modelo         text not null,
  prob_local     numeric(5,2) not null,
  prob_empate    numeric(5,2) not null,
  prob_visitante numeric(5,2) not null,
  marcador_probable text,
  prob_marcador  numeric(5,2)
);

create table analytics.prediccion_resultado (
  match_id          bigint primary key references core.match(id) on delete cascade,
  signo_real        smallint not null check (signo_real in (0,1,2)),
  acierto           boolean not null,
  log_loss          numeric(8,5) not null,
  brier             numeric(8,5) not null,
  marcador_acierto  boolean not null,
  calculado_en      timestamptz not null default now()
);

comment on table analytics.prediccion_emitida is
  'Predicción congelada en el momento de emitirse (modelo y versión), sin reescribir con datos posteriores.';
comment on table analytics.prediccion_resultado is
  'Resultado real frente a la predicción congelada: signo, acierto, log-loss, Brier y marcador exacto.';

grant select on analytics.prediccion_emitida, analytics.prediccion_resultado to facylf_lector;
grant select, insert, update, delete on analytics.prediccion_emitida, analytics.prediccion_resultado to facylf_publicador;
