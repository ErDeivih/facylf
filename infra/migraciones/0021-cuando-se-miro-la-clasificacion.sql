-- 0021 - CUÁNDO SE MIRÓ EL ARCHIVO DE LA CLASIFICACIÓN, para no reimportar por lo mismo dos veces.
--
-- Medido el 25/09/2026, al terminar la primera pasada con el plan corregido: 1.747 grupos importados y el plan
-- seguía pidiendo **1.394** grupos «por la tabla oficial archivada y legible». No era un fallo del importador:
-- la había leído y había decidido **no** escribirla, por motivos que sólo se ven al importar (los equipos
-- publicados no se resuelven dentro de su grupo, dos filas apuntan al mismo equipo, o el canónico no tiene
-- ninguna jornada completa a la que colgar la foto). El estado quedaba escrito —`rechazada`, `sin_corte`— pero
-- el plan sólo miraba «¿hay archivo legible?», así que **volvía a pedir esos 1.394 grupos en cada pasada**, y
-- los volvería a pedir para siempre. Un plan que se repite sin cambiar no es un plan: es una lista de deseos.
--
-- La columna guarda la fecha del archivo archivado (su `mtime`) cuando se decidió el estado. Con eso el plan
-- distingue «este archivo no lo he mirado» de «este archivo ya lo miré y no se puede usar»:
--
--   · mtime guardado = null      → nadie lo ha mirado: entra al plan.
--   · mtime guardado ≠ el de hoy → la federación ha vuelto a publicar: entra al plan (es un archivo nuevo).
--   · mtime guardado = el de hoy → ya se decidió con ESTE archivo: no entra, y el motivo está en
--                                  `tabla_oficial_estado`.
--
-- No es una caché por comodidad: es la única forma de que «no está importado» signifique lo mismo en el plan
-- y en la cobertura. Sin ella, los dos decían cosas distintas del mismo grupo.

alter table ops.coverage_checkpoint
  add column if not exists tabla_oficial_archivo_en timestamp with time zone;

comment on column ops.coverage_checkpoint.tabla_oficial_archivo_en is
  'Fecha (mtime) del archivo de clasificación con el que se decidió tabla_oficial_estado. Null = sin mirar. '
  'Si el mtime cambia, la federación ha republicado y el estado se vuelve a decidir.';
