-- 0017 - Escudos de club con procedencia, huella y contenido portable.
--
-- El escudo pertenece al club, no al equipo-temporada: se guarda una sola vez y puede usarse en
-- informes y web durante todas las temporadas. Se conserva la URL o nota de procedencia y la huella
-- evita duplicar el mismo fichero cuando aparece en cientos de calendarios.

create table core.club_asset (
  id                    bigint generated always as identity primary key,
  club_id               bigint not null references core.club(id) on delete cascade,
  tipo                   text not null default 'escudo' check (tipo in ('escudo')),
  mime_type              text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/svg+xml')),
  sha256                 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  contenido              bytea not null,
  fuente_url             text,
  fuente_descripcion     text,
  observado_en           timestamptz not null default now(),
  vigente                boolean not null default true,
  unique (club_id, tipo, sha256)
);

create unique index club_asset_vigente_unico_idx
  on core.club_asset(club_id, tipo) where vigente;

comment on table core.club_asset is
  'Recursos visuales del club. El binario se guarda para que informes y web no dependan de una URL externa.';

grant select on core.club_asset to facylf_lector;
grant select, insert, update, delete on core.club_asset to facylf_publicador;
grant usage, select on sequence core.club_asset_id_seq to facylf_publicador;

