-- 0056 · Escudos de federación con la misma forma y protecciones que los de club. Claude, 05/11/2026.
--
-- Por qué: la pantalla de competición enseña hoy las siglas del nombre de la competición en la
-- cabecera («LN» para la Liga Nacional Juvenil). David pide el escudo de la FEDERACIÓN, que es el
-- dueño real de la competición. El escudo del club ya se guardaba en `core.club_asset` (0017) con su
-- huella y su procedencia, pero no había sitio para el de la federación.
--
-- Aditiva: crea una tabla nueva y no toca ninguna migración aplicada. Reversible sin pérdida de datos
-- ajenos: `drop table core.federation_asset` se lleva sólo esta tabla (el `contenido` es el binario
-- del escudo; se puede volver a descargar de `fuente_url`).
--
-- El binario se guarda en la base a propósito: la web no depende de una URL externa que cambie o
-- desaparezca, y la federación no recibe una petición por cada visita a una ficha.

create table core.federation_asset (
  id                    bigint generated always as identity primary key,
  federation_id         smallint not null references core.federation(id) on delete cascade,
  tipo                   text not null default 'escudo' check (tipo in ('escudo')),
  mime_type              text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
  sha256                 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  contenido              bytea not null,
  fuente_url             text,
  fuente_descripcion     text,
  observado_en           timestamptz not null default now(),
  vigente                boolean not null default true,
  unique (federation_id, tipo, sha256)
);

-- Un solo escudo vigente por federación y tipo. La huella evita duplicar el mismo fichero cuando se
-- vuelve a descargar; el índice parcial garantiza que la web nunca tenga que elegir entre dos.
create unique index federation_asset_vigente_unico_idx
  on core.federation_asset(federation_id, tipo) where vigente;

comment on table core.federation_asset is
  'Recursos visuales de la federación (hoy, su escudo). El binario se guarda para que la web no dependa de una URL externa.';

-- La web lee con facylf_lector (0017 y 0050); el recolector de escudos escribe con facylf_publicador,
-- que además necesita la secuencia del identity.
grant select on core.federation_asset to facylf_lector;
grant select, insert, update, delete on core.federation_asset to facylf_publicador;
grant usage, select on sequence core.federation_asset_id_seq to facylf_publicador;
