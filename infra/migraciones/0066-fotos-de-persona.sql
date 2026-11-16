-- 0066 · Fotos de persona (jugadores, técnicos, árbitros).
--
-- Por qué: David decide el 16/11/2026 que las fotos de ficha que publica la federación se muestran en
-- la instancia privada, también las de menores. Sustituye, sólo en ese punto, a la decisión del
-- 05/11/2026 (`DOCTRINA-CALIDAD.md` §9), que publicaba el nombre y dejaba fuera la foto. La demo pública
-- estática sigue sin fotos: ver `docs/plataforma-web/SEGURIDAD-OPERACION.md`.
--
-- Mismo patrón que `core.club_asset` (0017): el binario se guarda una vez con su huella, la web lo
-- sirve desde el canónico y una visita a la ficha no genera ninguna petición al portal.
--
-- Aditiva y reversible: `drop table core.person_asset` se lleva sólo las fotos.

create table core.person_asset (
  id                 bigint generated always as identity primary key,
  person_id          bigint not null references core.person(id) on delete cascade,
  tipo               text not null default 'foto' check (tipo in ('foto')),
  mime_type          text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  sha256             text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  contenido          bytea not null check (octet_length(contenido) between 1 and 524288),
  fuente_url         text,
  -- Temporada de la ficha de la que salió: una foto de alevín no es la del mismo jugador en juvenil.
  season_id          smallint references core.season(id),
  observado_en       timestamptz not null default now(),
  vigente            boolean not null default true,
  unique (person_id, tipo, sha256)
);

create unique index person_asset_vigente_unico_idx
  on core.person_asset(person_id, tipo) where vigente;

comment on table core.person_asset is
  'Foto de ficha de una persona tal como la publica la federación. Sólo se sirve en la instancia privada.';
comment on column core.person_asset.contenido is
  'Binario de la imagen, como mucho 512 KiB: es una foto de ficha, no un original.';

grant select on core.person_asset to facylf_lector;
grant select, insert, update, delete on core.person_asset to facylf_publicador;
grant usage, select on sequence core.person_asset_id_seq to facylf_publicador;
