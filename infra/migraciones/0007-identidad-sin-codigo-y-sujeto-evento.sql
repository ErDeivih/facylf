-- 0007 · Dos defectos detectados al contrastar el esquema con los datos reales de la cola.
-- Aditiva: 0001-0006 no se reescriben.
-- Aplicada y verificada en PostgreSQL 16 antes de escribirla aquí.

-- ---------------------------------------------------------------------------
-- (1) Personas sin código federativo.
--
-- `person_source_identity_scope_uq` usa NULLS NOT DISTINCT sobre
-- (federation_id, codigo_externo, context_key). Como `context_key` es '' por defecto, TODA
-- persona sin código de una misma federación choca contra la misma fila: técnicos y árbitros
-- quedarían fundidos en una sola persona. Medido en la cola de Canarias el 14/09/2026:
-- 594 técnicos distintos, 235 árbitros distintos y 313 eventos de técnico, todos sin código.
--
-- Regla: con código, la identidad es (federación, código, contexto). Sin código, el contexto
-- es obligatorio y debe distinguir a la persona; '' deja de ser aceptable.
drop index core.person_source_identity_scope_uq;

create unique index person_source_identity_con_codigo_uq
  on core.person_source_identity(federation_id, codigo_externo, context_key)
  where codigo_externo is not null;

create unique index person_source_identity_sin_codigo_uq
  on core.person_source_identity(federation_id, context_key)
  where codigo_externo is null;

alter table core.person_source_identity
  add constraint person_source_identity_contexto_check check (
    codigo_externo is not null or btrim(context_key) <> ''
  );

comment on column core.person_source_identity.context_key is
  'Con código: ámbito en el que ese código es único. Sin código: discriminante obligatorio de la '
  'aparición nominal (por ejemplo rol y nombre normalizado). Nunca vacío si no hay código.';

-- ---------------------------------------------------------------------------
-- (2) Quién es el sujeto de un evento.
--
-- La cola distingue jugador / tecnico / desconocido, y el canónico lo perdía. Sin esta columna,
-- la amarilla de un entrenador entraría en la disciplina de un jugador. Medido en Canarias:
-- 313 eventos de técnico y 2 de sujeto no resuelto.
alter table core.match_event
  add column sujeto_tipo text not null default 'desconocido'
    check (sujeto_tipo in ('jugador','tecnico','arbitro','desconocido'));

comment on column core.match_event.sujeto_tipo is
  'Un evento de técnico NUNCA cuenta en una métrica de jugador. Un sujeto desconocido no se '
  'atribuye a nadie: la fuente no permitió resolverlo.';

-- Los rankings y la disciplina sólo miran eventos de jugador resuelto.
create index event_jugador_tipo_idx
  on core.match_event(person_id, event_type, match_id)
  where sujeto_tipo = 'jugador' and person_id is not null;

-- Un evento atribuido a una persona concreta tiene que decir de qué tipo de sujeto se trata.
alter table core.match_event
  add constraint event_sujeto_resuelto_check check (
    person_id is null or sujeto_tipo <> 'desconocido'
  );
