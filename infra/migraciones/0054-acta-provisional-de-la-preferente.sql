-- 0054 · Acta provisional de La Preferente para los partidos que la federación aún no tiene. Claude, 27/10/2026.
--
-- Decisión de Claude con el visto bueno general de David («decide tú», 27/10): LP es la BASE de todas las
-- federaciones mientras las federaciones llegan. Cuando un grupo de LP está emparejado con el de la federación
-- (externo.lp_emparejado) pero un partido aún no tiene acta de la federación (core.match_report), se puede enseñar
-- la ficha de LP como «acta provisional, no oficial». En cuanto entra el acta de la federación, la vista deja de
-- darla: nada se borra ni se mezcla en core.
--
-- Por qué no se importa al canónico como acta: el importador casa el acta con el partido por los códigos de la
-- federación, y dos fuentes escribiendo el mismo grupo se pisarían. Así core sólo tiene actas oficiales.
--
-- Menores: LP marca `menores` en las fichas de categorías de base. En las vistas, su nombre sale NULL (regla del
-- proyecto: nunca se publica el nombre de un menor). Y sólo se ven con facylf.lp_publico = 'on' (decisión D2, 0053).

create table if not exists externo.lp_partido_match (
  partido_clave text   primary key references externo.lp_partido(clave) on delete cascade,
  match_id      bigint not null references core.match(id) on delete cascade
);
create index if not exists lp_partido_match_match_idx on externo.lp_partido_match (match_id);
comment on table externo.lp_partido_match is
  'Partido de LP → partido del canónico (lo escribe scripts/lapreferente/empareja.mjs en los grupos emparejados).';

-- Las comprobaciones comunes: hay casamiento, no hay acta de la federación y LP es público.
create or replace view externo.acta_provisional_partido with (security_barrier) as
  select pm.match_id, p.clave as lp_clave, p.partido_id as lp_partido_id, p.ficha_leida_en,
         p.goles_local as lp_goles_local, p.goles_visitante as lp_goles_visitante, p.estadio, p.arbitro,
         bool_or(pa.menores) as menores
    from externo.lp_partido_match pm
    join externo.lp_partido p on p.clave = pm.partido_clave
    join externo.lp_participacion pa on pa.partido_clave = p.clave
   where not exists (select 1 from core.match_report r where r.match_id = pm.match_id)
     and coalesce(current_setting('facylf.lp_publico', true), '') = 'on'
   group by pm.match_id, p.clave;

create or replace view externo.acta_provisional_alineacion with (security_barrier) as
  select ap.match_id, pa.lado, pa.condicion, pa.orden, pa.dorsal,
         case when pa.menores then null else coalesce(pa.nombre, pa.alias) end as nombre,
         case when pa.condicion = 'tecnico' then pa.rol end as rol
    from externo.acta_provisional_partido ap
    join externo.lp_participacion pa on pa.partido_clave = ap.lp_clave;

create or replace view externo.acta_provisional_evento with (security_barrier) as
  select ap.match_id, e.orden, e.tipo, e.subtipo, e.minuto, e.lado,
         case when ap.menores then null else coalesce(j.nombre, j.alias) end as jugador,
         case when ap.menores then null else coalesce(en.nombre, en.alias) end as entra
    from externo.acta_provisional_partido ap
    join externo.lp_evento e on e.partido_clave = ap.lp_clave
    left join lateral (select x.nombre, x.alias from externo.lp_participacion x
                        where x.partido_clave = e.partido_clave and x.jugador_lp_id = e.jugador_lp_id limit 1) j on true
    left join lateral (select x.nombre, x.alias from externo.lp_participacion x
                        where x.partido_clave = e.partido_clave and x.jugador_lp_id = e.entra_lp_id limit 1) en on true;

comment on view externo.acta_provisional_partido is
  'Partidos con acta provisional de La Preferente (sin acta de la federación). Sólo con facylf.lp_publico = on. 0054.';

-- La web lee sólo las vistas; las tablas de externo no (0052 ya no le da permiso, y por si se aplicó la versión
-- anterior, se le quita aquí).
revoke select on all tables in schema externo from facylf_lector;
alter default privileges in schema externo revoke select on tables from facylf_lector;
grant usage on schema externo to facylf_lector;
grant select on externo.acta_provisional_partido, externo.acta_provisional_alineacion, externo.acta_provisional_evento
  to facylf_lector;
grant select, insert, update, delete on externo.lp_partido_match to facylf_publicador;
