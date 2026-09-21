-- 0010 · Claves naturales que faltaban para que un upsert idempotente sea posible.
--
-- El importador escribe con `insert … on conflict … do update` sobre las claves naturales del
-- canónico (encargo §8). Dos entidades no tenían ninguna restricción única sobre la clave con la que
-- se resuelven, así que el conflicto no existía y la idempotencia dependía de un `select` previo:
-- dos procesos a la vez habrían creado dos filas idénticas.
--
--   · `core.club` se resuelve por (federación, nombre canónico normalizado);
--   · `core.venue` se resuelve por código cuando existe (ya era único) y, cuando no, por nombre
--     normalizado DENTRO de la federación (IMPORTADOR-SQLITE.md §3).
--
-- Aditiva: 0001-0009 no se editan (una migración aplicada no se toca).

create unique index club_federation_nombre_uq on core.club(federation_id, nombre_norm);

create unique index venue_federation_nombre_sin_codigo_uq
  on core.venue(federation_id, nombre_norm)
  where codigo_externo is null;

comment on index core.club_federation_nombre_uq is
  'Clave natural del club dentro de su federación: el nombre canónico normalizado. Consolidar dos '
  'denominaciones distintas sigue siendo una decisión curada, no la hace el importador.';
