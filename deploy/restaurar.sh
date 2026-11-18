#!/usr/bin/env bash
# Ensayo de restauración. Uso:
#   DATABASE_URL_ADMIN=postgres://... bash deploy/restaurar.sh copia.dump facylf_restore_test
set -euo pipefail
: "${DATABASE_URL_ADMIN:?falta DATABASE_URL_ADMIN}"
dump="${1:?falta el .dump}"
destino="${2:-facylf_restore_test}"
admin="${DATABASE_URL_ADMIN%/*}"
psql "$admin/postgres" -v ON_ERROR_STOP=1 -c "drop database if exists \"$destino\";" -c "create database \"$destino\";"
pg_restore --no-owner --dbname="${admin}/${destino}" "$dump"
psql "${admin}/${destino}" -v ON_ERROR_STOP=1 -c "select count(*) as tablas from information_schema.tables where table_schema in ('core','analytics','app');"
psql "${admin}/${destino}" -v ON_ERROR_STOP=1 -c "select count(*) as partidos from core.match;"
psql "${admin}/${destino}" -v ON_ERROR_STOP=1 -c "select count(*) as usuarios from app.usuario;"
echo "restauración de prueba en $destino"
