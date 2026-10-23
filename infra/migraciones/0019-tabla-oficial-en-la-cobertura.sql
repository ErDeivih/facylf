-- 0019 - La tabla oficial del grupo, en la cobertura, para que quien consulta sepa POR QUÉ no está.
--
-- Medido el 25/09/2026: 736 grupos con la clasificación archivada y sin tabla oficial dentro, y el motivo del
-- descarte va a `ops.normalizacion_error`, que **el rol de lectura no ve** (la web lee con `facylf_lector`, y
-- ese esquema no está concedido a propósito). Resultado: una consulta que busque la tabla oficial de esos
-- grupos no encuentra nada y no puede distinguir «la federación todavía no la ha publicado» de «se archivó y
-- no se pudo leer». Son dos cosas distintas y la segunda es un problema de captura.
--
-- El estado vive en `ops.coverage_checkpoint` porque es la tabla que la web YA lee, y porque su significado es
-- el mismo: qué se sabe de este grupo y qué no. Tres valores, y ninguno inventado:
--
--   'importada'    · la tabla está en `core.standing_snapshot` con `origen = 'oficial'`.
--   'rechazada'    · se archivó y NO se pudo leer (posiciones incoherentes, puntos imposibles, valores no
--                    enteros…). El grupo se importa igual; lo que falta es la tabla oficial, y se dice.
--   'sin_archivar' · la federación no la ha publicado todavía (o el recolector no la ha bajado).
--
-- `null` es «no se ha calculado», que no es ninguno de los tres.

alter table ops.coverage_checkpoint
  add column if not exists tabla_oficial_estado text;

alter table ops.coverage_checkpoint
  drop constraint if exists coverage_tabla_oficial_estado_valido;

alter table ops.coverage_checkpoint
  add constraint coverage_tabla_oficial_estado_valido
  check (tabla_oficial_estado is null or tabla_oficial_estado in ('importada', 'rechazada', 'sin_archivar'));

comment on column ops.coverage_checkpoint.tabla_oficial_estado is
  'importada | rechazada | sin_archivar. Null = no calculado. Distingue «no la ha publicado» de «se archivó mal».';
