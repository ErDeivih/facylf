#!/usr/bin/env bash
# psql-canonico.sh — lanza SQL contra el canónico con el rol de SÓLO LECTURA
#
# ── POR QUÉ ES UN GUION ─────────────────────────────────────────────────────────────────────────────────
#
# Porque por `ssh` las comillas de PowerShell destrozan cualquier orden con comillas anidadas (es una regla del
# traspaso) y porque las credenciales del canónico viven en `docker/.env`, que no debe copiarse a ningún sitio.
# Aquí se leen y se traducen a variables `PG*` sin imprimirlas nunca: dentro del contenedor de Postgres el nombre
# de host de la URL puede no resolver, y con una URI `psql` ignora `PGHOST`.
#
# Uso (el SQL entra por la entrada estándar):
#   bash scripts/servidor/psql-canonico.sh <<'SQL'
#   select count(*) from core.match;
#   SQL
#
# Con `\timing on` en el SQL se ve cuánto tarda cada consulta.
set -uo pipefail
cd /srv/data/facylf || exit 1

url="$(grep -m1 '^DATABASE_URL_LECTOR=' docker/.env | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "$url" ]; then echo 'no encuentro DATABASE_URL_LECTOR en docker/.env' >&2; exit 1; fi

resto="${url#*://}"; credenciales="${resto%%@*}"
usuario="${credenciales%%:*}"; clave="${credenciales#*:}"
base="${resto#*@}"; base="${base##*/}"; base="${base%%\?*}"

# `-X` ignora el fichero de arranque de psql y `-q` no añade ruido. SIN `ON_ERROR_STOP`: en una consulta de
# exploración interesa que un error suelto no impida ver el resto.
docker exec -i -e PGPASSWORD="$clave" facylf-postgres \
  psql -U "$usuario" -d "$base" -h 127.0.0.1 -X -q -f -
