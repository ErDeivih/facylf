-- 0008 · Identidad nominal y formato obligatorio del contexto de las personas sin código.
-- Cierra las dos ambigüedades que quedaban en ADR-0011 y que un implementador resolvería al azar.
-- Aditiva: 0001-0007 no se reescriben. Aplicada y verificada en PostgreSQL antes de escribirla aquí.

-- ---------------------------------------------------------------------------
-- (1) Una persona sin código federativo NUNCA tiene identidad demostrada.
alter table core.person
  add column identidad_nominal boolean not null default false;

comment on column core.person.identidad_nominal is
  'Verdadero cuando la persona sólo se conoce por su nombre publicado, sin código federativo '
  '(árbitros y cuerpo técnico en las fuentes PNFG). La ficha lo declara y la persona queda fuera '
  'de rankings nominales. No es un defecto de recolección: la fuente no publica ese código.';

create index person_nominal_idx on core.person(id) where identidad_nominal;

-- ---------------------------------------------------------------------------
-- (2) Formato del contexto, verificable por la base.
--
-- Sin esto, «temporada y el ámbito disponible» admite desde el nombre suelto hasta una fila por
-- partido. Medido en la cola de Canarias el 14/09/2026, la diferencia es enorme:
--   árbitros: 235 por nombre · 514 con temporada · 598 con temporada+edición · 1.846 por partido
--   técnicos: 594 por nombre · 735 con temporada · 780 con temporada+edición · 8.081 por acta
-- Decisión: temporada + edición para árbitros, temporada + equipo para cuerpo técnico. Nunca
-- partido ni acta: multiplica personas fantasma sin separar mejor a dos homónimos reales.
--
-- Formato: rol=<rol normalizado>;temporada=<AAAA-AA>;ambito=<edicion|equipo>:<id>;nombre=<normalizado>
alter table core.person_source_identity
  add constraint person_source_identity_contexto_formato_check check (
    codigo_externo is not null
    or context_key ~ '^rol=[a-z0-9 ]+;temporada=[0-9]{4}-[0-9]{2};ambito=(edicion|equipo):[0-9]+;nombre=[a-z0-9 ]+$'
  );

comment on constraint person_source_identity_contexto_formato_check on core.person_source_identity is
  'El rol y el nombre van normalizados con core.normaliza_nombre; el literal original se conserva '
  'en core.match_staff.rol y en core.person_name. Un contexto mal construido falla aquí, en voz '
  'alta, en vez de fundir o fragmentar identidades en silencio.';
