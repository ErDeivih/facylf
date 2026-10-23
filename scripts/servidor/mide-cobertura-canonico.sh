#!/usr/bin/env bash
# mide-cobertura-canonico.sh — cuánto tarda DE VERDAD cada consulta de la página /canonico
#
# ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
#
# `/canonico` sigue enseñando «La consulta superó el presupuesto de tiempo del servidor de la web (5 s)»
# (código 57014 de Postgres) mientras `/competiciones` ya funciona. La página lanza TRES consultas y no dice
# cuál falla, así que se miden las tres por separado con el cronómetro de `psql`, más los recuentos sueltos que
# las componen: si el culpable es un `count(*)` sobre una tabla grande, se ve en la primera línea.
#
# La SOSPECHA, escrita antes de medir: `RESUMEN_CANONICO` hace diez `count(*)` seguidos sobre `core.match`,
# `core.match_report`, `core.appearance`, `core.match_event` y `core.person`. En Postgres `count(*)` sin filtro
# es un recorrido completo, y `core.appearance` es la tabla más grande del canónico.
#
# SÓLO LEE (select). No cambia nada.
#
# Uso:  bash scripts/servidor/mide-cobertura-canonico.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

# Las credenciales salen de `docker/.env` y NO se imprimen: se traducen a las variables PG* porque dentro del
# contenedor de Postgres el nombre de host de la URL puede no resolver, y con una URI psql ignora PGHOST.
url="$(grep -m1 '^DATABASE_URL_LECTOR=' docker/.env | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "$url" ]; then echo 'no encuentro DATABASE_URL_LECTOR en docker/.env'; exit 1; fi
resto="${url#*://}"; credenciales="${resto%%@*}"
usuario="${credenciales%%:*}"; clave="${credenciales#*:}"
base="${resto#*@}"; base="${base##*/}"; base="${base%%\?*}"

echo "══ midiendo el canónico (usuario ${usuario}, base ${base}) ══"
echo "· reloj: $(date -Is)"
echo

docker exec -i -e PGPASSWORD="$clave" facylf-postgres \
  psql -U "$usuario" -d "$base" -h 127.0.0.1 -X -q -f - <<'SQL'
\timing on
\echo '── tamaño de las tablas implicadas (filas estimadas por el planificador) ──'
-- `reltuples` vive en `pg_class`, no en `pg_stat_user_tables`: ahí está el error de la primera versión, que
-- además abortaba el guion entero por llevar `ON_ERROR_STOP`. Y sin él, un fallo suelto no impide medir el resto.
select c.relname as tabla,
       to_char(c.reltuples, '999G999G999') as filas_estimadas,
       pg_size_pretty(pg_total_relation_size(c.oid)) as tamano
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('core','ops') and c.relkind = 'r'
 order by pg_total_relation_size(c.oid) desc limit 12;

\echo ''
\echo '── recuentos sueltos: ¿cuál de los diez se lleva el tiempo? ──'
select count(*) as federaciones from (select distinct federation_id from core.competition_edition) t;
select count(*) as ediciones from core.competition_edition;
select count(*) as grupos from core.phase_group;
select count(*) as partidos from core.match;
select count(*) as informes from core.match_report;
select count(*) as participaciones from core.appearance;
select count(*) as eventos from core.match_event;
select count(*) as personas from core.person;

\echo ''
\echo '── las tres consultas de la página, tal cual están escritas ──'
select
  (select count(distinct federation_id) from core.competition_edition)::int as federaciones,
  (select count(*) from core.competition_edition)::int as ediciones,
  (select count(*) from core.phase_group)::int as grupos,
  (select count(*) from core.match)::int as partidos,
  (select count(*) from core.match_report)::int as informes,
  (select count(*) from core.appearance)::int as participaciones,
  (select count(*) from core.match_event)::int as eventos,
  (select count(*) from core.person)::int as personas,
  (select count(*) from ops.coverage_checkpoint where visibility_state = 'completa')::int as grupos_completos,
  (select max(calculado_en) from ops.coverage_checkpoint) as calculado_en
 limit 1;

-- Las dos siguientes se lanzan TAL CUAL, sin envolverlas en un count(*) exterior: envolverlas anularía el
-- `limit` y forzaría la ordenación completa, midiendo un trabajo que la página nunca hace. La salida se manda a
-- /dev/null para que no ensucie; lo que interesa es el cronómetro.
\o /dev/null
select f.codigo                    as federacion,
       f.nombre                    as federacion_nombre,
       s.etiqueta                  as temporada,
       e.nombre_publicado          as edicion,
       e.ambito,
       g.nombre                    as grupo,
       g.codigo_externo            as grupo_codigo,
       g.jornadas_previstas,
       c.partidos_conocidos,
       c.partidos_con_resultado,
       c.actas_disponibles,
       c.actas_parseadas,
       c.complete_through_matchday,
       c.visibility_state,
       c.calculado_en
  from core.phase_group g
  join core.competition_edition e on e.id = g.competition_edition_id
  join core.federation f on f.id = e.federation_id
  join core.season s on s.id = e.season_id
  left join ops.coverage_checkpoint c on c.phase_group_id = g.id
 where (null::text is null or f.codigo = null::text)
 order by f.codigo, s.orden desc, e.nombre_publicado, g.orden, g.codigo_externo
 limit 200;

select f.codigo          as federacion,
       g.codigo_externo  as grupo_codigo,
       c.visibility_state,
       c.complete_through_matchday,
       c.partidos_conocidos,
       c.partidos_con_resultado,
       c.calculado_en
  from core.phase_group g
  join core.competition_edition e on e.id = g.competition_edition_id
  join core.federation f on f.id = e.federation_id
  left join ops.coverage_checkpoint c on c.phase_group_id = g.id
 order by f.codigo, g.codigo_externo
 limit 500;
\o
SQL
