#!/usr/bin/env bash
# ── VACUUM + ANALYZE DEL CANÓNICO (01/10/2026; lo lanza David) ─────────────────────────────────────────────────
# Diagnóstico (estado/claude/respuestas/09-mantenimiento-canonico.txt): Postgres se apagó mal el 30/09 a las
# 08:39 («database system was not properly shut down») y con eso se perdieron sus contadores: cree que
# core.match tiene 3.157 filas vivas (son ~103.000) y core.appearance acumula 173.641 filas muertas frente a
# 73.560 «vivas». Autovacuum decide con esos contadores, así que llega tarde.
# Qué hace: VACUUM (ANALYZE) de la base entera. NO es VACUUM FULL: no bloquea tablas ni reescribe nada, se puede
# lanzar con el importador en marcha. Tarda unos minutos. Después, las consultas del importador y de la web
# vuelven a tener estadísticas reales.
set -uo pipefail
U=$(docker exec facylf-postgres printenv POSTGRES_USER 2>/dev/null || echo postgres)
D=$(docker exec facylf-postgres printenv POSTGRES_DB 2>/dev/null || echo facylf)
echo "== VACUUM (ANALYZE) en $D como $U · $(date '+%T')"
time docker exec facylf-postgres psql -U "$U" -d "$D" -X -q -c 'VACUUM (ANALYZE);'
docker exec facylf-postgres psql -U "$U" -d "$D" -X -c "select relname, n_live_tup, n_dead_tup, last_vacuum, last_analyze from pg_stat_user_tables order by n_dead_tup desc limit 8;"
