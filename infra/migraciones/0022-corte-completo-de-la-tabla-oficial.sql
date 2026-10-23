-- 0022 - ¿La foto de la tabla oficial se colgó de una jornada COMPLETA?
--
-- Decisión tomada el 27/09/2026, con el usuario delante y después de medir el problema.
--
-- El caso. Cuando la federación publica la clasificación y el canónico NO tiene ninguna jornada completa —una
-- temporada que acaba de empezar, o un calendario recogido a medias—, el importador no escribía la tabla. La
-- negativa estaba razonada: colgarla de una jornada incompleta sería presentar como «la tabla de J30» la foto de
-- otro día (v. migración 0020, estado 'sin_corte'). Pero la consecuencia era que **1.404 grupos** se quedaban
-- sin su tabla oficial teniendo el archivo legible y los equipos resueltos.
--
-- Lo que se hace desde ahora. La tabla SÍ se escribe, anclada a la **última jornada que exista** del grupo
-- aunque no esté completa, y la salvedad queda declarada aquí, donde la web la puede leer: no basta con
-- guardarla en `ops.normalizacion_error`, porque el rol de lectura no ve esa tabla y entonces la foto viajaría
-- sin su fecha.
--
--   `true`  · la jornada de corte estaba COMPLETA: es una foto verificada de esa jornada.
--   `false` · se ancló a una jornada INCOMPLETA: la tabla es la que la federación publica, pero la fecha de
--             corte es la última que tenemos, no una fecha confirmada. La web debe decirlo.
--   `null`  · no hay tabla oficial escrita (o el corte no aplica): no se afirma nada.
--
-- El estado 'sin_corte' NO desaparece: sigue siendo el valor correcto para los grupos que no tienen ni una
-- jornada, donde no hay nada de lo que colgar la foto.

alter table ops.coverage_checkpoint
  add column if not exists tabla_oficial_corte_completo boolean;

comment on column ops.coverage_checkpoint.tabla_oficial_corte_completo is
  'true = la tabla oficial se ancló a una jornada COMPLETA (foto verificada) · false = se ancló a la última '
  'jornada existente, que NO está completa (la tabla es la publicada, la fecha no está confirmada) · null = no '
  'hay tabla escrita. Existe para que la foto no viaje sin decir de qué fecha es.';
