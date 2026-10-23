-- 0047 · El resumen del canónico deja de contar 19 millones de filas en cada visita.
--
-- `/canonico` enseña cuántas federaciones, ediciones, grupos, partidos, actas, apariciones, eventos y
-- personas hay. Esas cifras se pedían con `count(*)` sobre las tablas de hechos en cada visita: con la base
-- real (19,5 M de apariciones, 4,5 M de eventos, 1,2 M de partidos) la consulta tarda decenas de segundos y
-- el presupuesto de la web (20 s) se agota. No es un problema de índices: PostgreSQL no puede contar sin
-- recorrer las filas (la tabla de 6 GB no cabe en `shared_buffers`).
--
-- Solución: una fila con los recuentos (`ops.recuento_canonico`), que se recalcula al terminar cada pasada
-- del proyector (`scripts/proyectar-lectura.mjs`). La web lee una fila por clave primaria. Mientras el
-- proyector no haya pasado, la fila se rellena aquí una vez (la migración tarda lo que tarde ese único
-- `count`, y a partir de ahí ya no se vuelve a pagar).
--
-- Los recuentos son de TABLAS DE HECHOS del canónico, no de `analytics`: no dependen de que la proyección
-- esté al día. `calculado_en` dice cuándo se contaron, para que la web pueda enseñar la fecha.

create table if not exists ops.recuento_canonico (
  id                smallint primary key default 1 check (id = 1),
  federaciones      integer not null default 0,
  ediciones         integer not null default 0,
  grupos            integer not null default 0,
  partidos          integer not null default 0,
  informes          integer not null default 0,
  participaciones   integer not null default 0,
  eventos           integer not null default 0,
  personas          integer not null default 0,
  grupos_completos  integer not null default 0,
  calculado_en      timestamptz not null default now()
);

-- Recalcula la fila entera. Devuelve lo calculado para poder enseñarlo en el registro del proyector.
create or replace function ops.actualiza_recuento_canonico() returns jsonb language plpgsql as $$
declare r ops.recuento_canonico;
begin
  insert into ops.recuento_canonico as d (id, federaciones, ediciones, grupos, partidos, informes,
    participaciones, eventos, personas, grupos_completos, calculado_en)
  select 1,
         (select count(distinct federation_id) from core.competition_edition),
         (select count(*) from core.competition_edition),
         (select count(*) from core.phase_group),
         (select count(*) from core.match),
         (select count(*) from core.match_report),
         (select count(*) from core.appearance),
         (select count(*) from core.match_event),
         (select count(*) from core.person),
         (select count(*) from ops.coverage_checkpoint where visibility_state = 'completa'),
         now()
  on conflict (id) do update set
    federaciones = excluded.federaciones, ediciones = excluded.ediciones, grupos = excluded.grupos,
    partidos = excluded.partidos, informes = excluded.informes, participaciones = excluded.participaciones,
    eventos = excluded.eventos, personas = excluded.personas, grupos_completos = excluded.grupos_completos,
    calculado_en = excluded.calculado_en
  returning * into r;
  return to_jsonb(r) - 'id';
end $$;

-- Relleno inicial: una sola pasada. Si la base es enorme, esto es lo único que se paga una vez.
select ops.actualiza_recuento_canonico();

grant select on ops.recuento_canonico to facylf_lector, facylf_app;
-- El proyector escribe la fila; la web sólo la lee.
grant select, insert, update on ops.recuento_canonico to facylf_publicador;
grant execute on function ops.actualiza_recuento_canonico() to facylf_publicador;
