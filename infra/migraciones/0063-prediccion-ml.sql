-- 0063 · Predicción por modelo de ML con banda de confianza.
--
-- El modelo compara Poisson/Dixon-Coles, Elo y un clasificador de gradiente con variables (Elo,
-- descanso, forma, momento, impacto de plantilla y cambio de entrenador). La validación temporal y sus
-- métricas (log-loss, Brier, calibración) están en `pruebas/prediccion/evaluacion.json`.
--
-- Esta tabla es la salida publicable: 1-X-2, marcador más probable y banda (mínimo/máximo entre los
-- tres modelos, que es una banda de desacuerdo, no un intervalo estadístico). Dato derivado y reversible.

create table analytics.prediccion_ml (
  match_id          bigint primary key references core.match(id) on delete cascade,
  prob_local        numeric(5,2) not null check (prob_local between 0 and 100),
  prob_empate       numeric(5,2) not null check (prob_empate between 0 and 100),
  prob_visitante    numeric(5,2) not null check (prob_visitante between 0 and 100),
  prob_local_low    numeric(5,2) not null,
  prob_local_high   numeric(5,2) not null,
  prob_empate_low   numeric(5,2) not null,
  prob_empate_high  numeric(5,2) not null,
  prob_visitante_low  numeric(5,2) not null,
  prob_visitante_high numeric(5,2) not null,
  marcador_probable text check (marcador_probable ~ '^[0-9]+-[0-9]+$'),
  prob_marcador     numeric(5,2),
  modelo            text not null default 'ml-hgb-v1',
  log_loss          numeric(8,5),
  brier             numeric(8,5),
  baseline_log_loss numeric(8,5),
  calculado_en      timestamptz not null default now()
);

comment on table analytics.prediccion_ml is
  'Salida del modelo ML con banda de desacuerdo entre ML, Elo y Poisson; validada temporalmente en pruebas/prediccion/evaluacion.json.';

create index prediccion_ml_modelo on analytics.prediccion_ml (modelo);

grant select on analytics.prediccion_ml to facylf_lector;
grant select, insert, update, delete on analytics.prediccion_ml to facylf_publicador;
