-- 0015 · El diario de lote aprende a deshacer un BORRADO.
--
-- Por qué hacía falta: `ops.batch_cambio` sólo admitía `insert` y `update`, así que un lote que borrara
-- filas —una retirada— era irreversible. Y no es un caso teórico: la reparación de las filas de descanso
-- necesita retirar la inscripción fantasma `Atsedena` y sus dos partidos del grupo 23233962 de Euskadi, y
-- la regla de la casa es que nada se borra a mano y todo se puede deshacer.
--
-- La acción nueva guarda la fila ENTERA en `anterior`, igual que hace `update`: al revertir, la fila se
-- vuelve a insertar tal y como estaba, con su `id`. El orden importa y lo lleva `reversion.ts`: se borra de
-- hijos a padres y se reinscribe de padres a hijos, y una clave foránea impide lo contrario.
--
-- Aditiva: 0001-0014 no se tocan (una migración aplicada no se edita).

alter table ops.batch_cambio drop constraint batch_cambio_accion_check;
alter table ops.batch_cambio add constraint batch_cambio_accion_check
  check (accion in ('insert', 'update', 'borrado'));

comment on column ops.batch_cambio.accion is
  'insert: el lote creó la fila (al revertir se borra). update: el lote la cambió (al revertir se '
  'restaura `anterior`). borrado: el lote la RETIRÓ (al revertir se vuelve a insertar `anterior` entera).';
