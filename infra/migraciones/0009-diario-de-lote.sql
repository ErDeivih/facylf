-- 0009 · Diario de cambios por lote: lo que permite que `--revertir <batch_id>` deshaga un lote
-- exactamente y no «aproximadamente».
--
-- Por qué hace falta una tabla: las claves naturales del canónico permiten reimportar sin duplicar,
-- pero no permiten saber QUÉ creó un lote concreto ni CÓMO estaba una fila antes de que el lote la
-- actualizara. Sin eso, revertir sólo se puede hacer borrando el ámbito entero, y eso destruiría
-- datos de lotes anteriores.
--
-- Aditiva: 0001-0008 no se tocan (una migración aplicada no se edita).

create table ops.batch_cambio (
  id            bigint      generated always as identity primary key,
  batch_id      bigint      not null references ops.batch(id) on delete cascade,
  tabla         text        not null,
  accion        text        not null check (accion in ('insert','update')),
  clave         jsonb       not null,           -- identificador de la fila, por ejemplo {"id": 123}
  anterior      jsonb,                          -- fila previa completa (sólo en 'update')
  registrado_en timestamptz not null default now()
);

comment on table ops.batch_cambio is
  'Diario de un lote: qué filas creó y qué filas actualizó, con sus valores anteriores. '
  'Permite revertir un lote exactamente. Para que no crezca sin límite, al abrir un lote nuevo del '
  'mismo ámbito se poda el diario de los lotes anteriores de ese ámbito y éstos quedan marcados como '
  'no revertibles (ver packages/canonico/src/lote.ts).';

create index batch_cambio_batch_idx on ops.batch_cambio(batch_id, id);
create index batch_cambio_tabla_idx on ops.batch_cambio(batch_id, tabla);

-- El publicador necesita escribir y leer el diario; el lector, no.
grant select, insert, update, delete on ops.batch_cambio to facylf_publicador;
grant usage, select on sequence ops.batch_cambio_id_seq to facylf_publicador;
