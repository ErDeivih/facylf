-- 0018 - Plantillas publicadas por la ficha oficial del equipo.
-- Una alineación no es una plantilla: se conservan también los inscritos que aún no han participado.

create table core.squad_snapshot (
  id bigint generated always as identity primary key,
  team_entry_id bigint not null references core.team_entry(id) on delete cascade,
  captured_at timestamptz not null default now(),
  source_url text not null,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  declared_players integer check (declared_players is null or declared_players >= 0),
  unique (team_entry_id, content_sha256)
);

create table core.squad_member (
  snapshot_id bigint not null references core.squad_snapshot(id) on delete cascade,
  role text not null check (role in ('player','coach','delegate')),
  source_order integer not null check (source_order >= 0),
  display_name text not null,
  display_name_norm text generated always as (core.normaliza_nombre(display_name)) stored,
  person_id bigint references core.person(id),
  resolution text not null check (resolution in ('same_club','unique_federation','appearance_current','unresolved','ambiguous')),
  primary key (snapshot_id, role, source_order),
  unique (snapshot_id, role, display_name_norm)
);

create index squad_snapshot_team_latest_idx on core.squad_snapshot(team_entry_id, captured_at desc, id desc);
create index squad_member_person_idx on core.squad_member(person_id) where person_id is not null;

create view core.current_squad_member as
with latest as (
  select distinct on (team_entry_id) id, team_entry_id, captured_at, declared_players
  from core.squad_snapshot order by team_entry_id, captured_at desc, id desc
)
select l.team_entry_id, l.captured_at, l.declared_players,
       m.role, m.source_order, m.display_name, m.display_name_norm, m.person_id, m.resolution
from latest l join core.squad_member m on m.snapshot_id=l.id;

grant select on core.squad_snapshot, core.squad_member, core.current_squad_member to facylf_lector;
grant select, insert, update, delete on core.squad_snapshot, core.squad_member to facylf_publicador;
grant usage, select on sequence core.squad_snapshot_id_seq to facylf_publicador;

comment on view core.current_squad_member is
  'Foto más reciente de la plantilla oficial por inscripción; incluye inscritos sin apariciones.';

