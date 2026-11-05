-- 0059 · Nombre corto de equipo, guardado y revisable. Claude, 05/11/2026.
--
-- Por qué: en las capturas de David los nombres largos de la fuente («C.D. Tierra Castellana
-- NEUMÁTICOS ABEL SANZ CIUDAD DE ARÉVALO») no caben en la jornada y en la clasificación. El nombre
-- corto no se puede inventar en la interfaz: es una decisión de presentación que hay que poder revisar,
-- corregir a mano y volver a usar sin que cada pantalla aplique una regla distinta.
--
-- Aditiva: crea una tabla nueva y no toca `core.team_entry` ni ninguna migración aplicada. Reversible:
-- `drop table analytics.nombre_corto_equipo` se lleva sólo esta tabla; se puede volver a poblar con
-- `node scripts/nombres-cortos-equipos.mjs`.
--
-- Va en `analytics` a propósito: es un dato derivado de presentación, no canónico. La clave es la
-- inscripción (`team_entry`), que es la entidad que se enseña en jornadas y clasificaciones; el club
-- puede tener varias inscripciones con el mismo nombre corto y distinta letra (A, B, C…).

create table analytics.nombre_corto_equipo (
  team_entry_id  bigint primary key references core.team_entry(id) on delete cascade,
  nombre_corto   text not null check (btrim(nombre_corto) <> ''),
  -- Cómo se obtuvo: 'regla' = derivado del nombre publicado; 'manual' = decidido y revisado a mano.
  metodo         text not null check (metodo in ('regla', 'manual')),
  -- 0..1. Las reglas que recortan mucho o dejan dudas bajan la confianza para poder revisarlas.
  confianza      numeric(3,2) not null default 1.00 check (confianza >= 0 and confianza <= 1),
  observado_en   timestamptz not null default now()
);

comment on table analytics.nombre_corto_equipo is
  'Nombre corto de presentación por inscripción de equipo, derivado del nombre publicado y revisable a mano. No sustituye al nombre de la fuente.';
comment on column analytics.nombre_corto_equipo.metodo is
  'regla = derivado automáticamente; manual = corregido y decidido a mano.';
comment on column analytics.nombre_corto_equipo.confianza is
  'Confianza de la derivación (0..1). Por debajo de 0,7 pide revisión manual.';

-- La web lee con facylf_lector; el script de poblado escribe con facylf_publicador (mismo patrón que
-- el resto de tablas de analytics). Sin secuencia: la clave es el team_entry, no un identity.
grant select on analytics.nombre_corto_equipo to facylf_lector;
grant select, insert, update, delete on analytics.nombre_corto_equipo to facylf_publicador;
