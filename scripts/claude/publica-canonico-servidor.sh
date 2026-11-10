#!/bin/bash
# Restaura un volcado del canónico en una base NUEVA del servidor. Lo usa publica-canonico.ps1, que sustituye
# __BASE__ por el nombre de la base y __DUMP__ por la ruta del volcado ya copiado al servidor.
# Reglas: no borra ni toca ninguna base existente (falla si la base ya existe), no usa --no-acl (RLS incluido),
# y restaura con prioridad baja para no comerse la CPU de la recolección.
set -u
BASE="__BASE__"
DUMP="__DUMP__"

echo "=== volcado ==="
sha256sum "$DUMP" || { echo "no existe el volcado"; exit 1; }
ls -la "$DUMP"
echo "=== disco antes ==="
df -h / | tail -1
echo "=== ¿existe ya la base? (si existe, se para: nunca se restaura encima) ==="
EXISTE=$(docker exec facylf-postgres psql -U facylf_admin -d postgres -At -c "select count(*) from pg_database where datname='$BASE'")
echo "existe=$EXISTE"
if [ "$EXISTE" != "0" ]; then echo "ERROR: la base $BASE ya existe; no se toca"; exit 2; fi
echo "=== creando $BASE ==="
docker exec facylf-postgres psql -U facylf_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "create database $BASE template template0 encoding 'UTF8' lc_collate 'en_US.utf8' lc_ctype 'en_US.utf8' owner facylf_admin" || exit 1
echo "=== copia dentro del contenedor ==="
docker cp "$DUMP" facylf-postgres:/tmp/volcado-publicacion.dump
echo "=== restauración (nice 19, 2 hilos) ==="
date
docker exec facylf-postgres nice -n 19 pg_restore -U facylf_admin -d "$BASE" --no-owner -j 2 /tmp/volcado-publicacion.dump > /tmp/restauracion-publicacion.log 2>&1
echo "pg_restore: codigo $?"
date
echo "=== errores (si hay) ==="
grep -viE '^$' /tmp/restauracion-publicacion.log | head -10
echo "=== bases (ninguna borrada) ==="
docker exec facylf-postgres psql -U facylf_admin -d postgres -At -F ' | ' -c "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where datname like 'facylf%' order by 1"
echo "=== carga y disco ==="
cat /proc/loadavg
df -h / | tail -1
echo "=== FIN SERVIDOR ==="
