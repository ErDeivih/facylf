-- 0065 · La simulación dice cuántos partidos ha simulado y cuántos ha tenido que deducir.
--
-- Por qué: `analytics.simulacion_final` (0062) simulaba sólo los partidos pendientes que tienen fila en
-- `core.match`. El canónico no guarda las jornadas futuras hasta que la federación las publica, así que
-- en un grupo que va por la jornada 10 de 34 se simulaban tres aplazados y cada equipo salía con el
-- 100 % en su puesto de hoy. `03-simulacion.mjs` deduce ahora el resto del calendario cuando el grupo
-- es una liga a una o dos vueltas (equipos y `jornadas_previstas` cuadran) y lo declara aquí, para que
-- la web pueda decir con qué se ha hecho la estimación.
--
-- Aditiva: dos columnas con valor por defecto. Las filas antiguas quedan en 0/0 y se sustituyen en la
-- siguiente pasada de `node scripts/prediccion/03-simulacion.mjs`.

alter table analytics.simulacion_final
  add column partidos_pendientes smallint not null default 0 check (partidos_pendientes >= 0),
  add column partidos_deducidos  smallint not null default 0 check (partidos_deducidos >= 0);

comment on column analytics.simulacion_final.partidos_pendientes is
  'Partidos sin resultado que ya tienen fila en core.match (calendario publicado) y se han simulado.';
comment on column analytics.simulacion_final.partidos_deducidos is
  'Partidos sin fila en core.match que se han deducido del formato de liga (equipos y jornadas previstas) y simulado.';
