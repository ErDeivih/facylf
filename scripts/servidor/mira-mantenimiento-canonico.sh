#!/bin/bash
# ── ¿ESTÁ LA BASE CANÓNICA SIN MANTENER? ────────────────────────────────────────────────────────────────
#
# El 21/09/2026 el importador hacía un grupo en 3-48 SEGUNDOS (está escrito en su propio estado). El 01/10/2026
# tarda entre 35 minutos y más de dos horas por el mismo trabajo. Eso no es «va cargado»: es que algo se ha
# vuelto mil veces más lento, y hay una causa que encaja con todo lo demás:
#
# **PostgreSQL necesita VACUUM y ANALYZE para no degradarse.** Sin ellos, las tablas se llenan de filas muertas
# (cada importación reescribe filas), los índices crecen, el planificador deja de tener estadísticas y cada
# consulta se vuelve más lenta. Este canónico recibe millones de filas al día y **nunca se ha mirado**.
#
# El síntoma que lo delata es `n_live_tup = 0` en `pg_stat_user_tables` para tablas que tienen cientos de miles
# de filas: eso sólo pasa si no se ha hecho ANALYZE jamás. Y `last_autovacuum` nulo lo confirma.
#
# SÓLO LEE.
#
# Uso:  bash mira-mantenimiento-canonico.sh
set -u

docker exec -i facylf-postgres psql -U facylf_admin -d facylf -X <<'SQL'
\pset pager off

\echo === ¿se ha hecho alguna vez VACUUM o ANALYZE en las tablas de hechos? ===
select relname,
       n_live_tup,
       n_dead_tup,
       last_vacuum,
       last_autovacuum,
       last_analyze,
       last_autoanalyze,
       pg_size_pretty(pg_total_relation_size(relid)) as tamanio
from pg_stat_user_tables
order by pg_total_relation_size(relid) desc
limit 14;

\echo === la configuración de autovacuum que gobierna esto ===
select name, setting, source from pg_settings
where name in ('autovacuum','autovacuum_max_workers','autovacuum_naptime','autovacuum_vacuum_scale_factor',
               'autovacuum_vacuum_threshold','autovacuum_vacuum_insert_threshold','maintenance_work_mem',
               'autovacuum_work_mem','shared_buffers','effective_cache_size','max_parallel_maintenance_workers')
order by name;

\echo === ¿hay transacciones viejas que impidan limpiar? ===
select pid, state, now() - xact_start as duracion, left(regexp_replace(query, '\s+', ' ', 'g'), 60) as consulta
from pg_stat_activity
where datname = current_database() and xact_start is not null
order by xact_start
limit 6;

\echo === cuántas filas muertas hay en total, por si el número es de millones ===
select sum(n_dead_tup) as filas_muertas_totales, sum(n_live_tup) as filas_vivas_estimadas
from pg_stat_user_tables;
SQL
