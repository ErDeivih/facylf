#!/usr/bin/env bash
# ── Aplica las migraciones del canónico EN EL SERVIDOR y deja los roles con sus contraseñas ────────────────
#
# Se ejecuta en el servidor (donde no hay Node en el host pero sí `psql` dentro del contenedor de PostgreSQL):
#
#   1. comprueba que la base es NUEVA (sin `ops.migracion`); si ya tiene migraciones, no toca nada y lo dice;
#   2. aplica el SQL generado por `scripts/servidor/sql-migraciones.mjs`;
#   3. pone la contraseña de `facylf_lector` y `facylf_publicador` con las que están en `docker/.env`
#      (las migraciones crean los roles SIN contraseña: el proyecto lo hace así a propósito, para que no viaje
#      en el repositorio);
#   4. comprueba que el rol de lectura puede leer y NO puede escribir (eso es lo que la web exige).
#
# Uso:  bash scripts/servidor/aplicar-migraciones.sh [raiz]
set -uo pipefail

RAIZ="${1:-/srv/data/facylf}"
CONTENEDOR="facylf-postgres"
PSQL="docker exec -i $CONTENEDOR psql -v ON_ERROR_STOP=1 -U facylf_admin -d facylf -tA"

cd "$RAIZ" || exit 1

echo "── 1 · ¿la base es nueva? ──"
EXISTE=$($PSQL -c "select to_regclass('ops.migracion') is not null" 2>/dev/null | tr -d '[:space:]')
if [ "$EXISTE" = "t" ]; then
  echo "  ya tiene migraciones aplicadas: no se toca nada."
  echo "  (para aplicar pendientes, usa scripts/migrar-canonico.mjs desde una máquina con Node y Docker)"
  APLICAR=0
else
  echo "  base nueva (sin ops.migracion): se aplican las 15 migraciones."
  APLICAR=1
fi

if [ "$APLICAR" = "1" ]; then
  echo "── 2 · aplicando migraciones ──"
  docker cp /tmp/migraciones.sql "$CONTENEDOR":/tmp/migraciones.sql
  if docker exec -i "$CONTENEDOR" psql -v ON_ERROR_STOP=1 -U facylf_admin -d facylf -f /tmp/migraciones.sql > /tmp/migraciones.log 2>&1; then
    echo "  aplicadas: $(grep -c '^-- ══════════' /tmp/migraciones.sql) migraciones"
    echo "  registro: $($PSQL -c 'select count(*) from ops.migracion' | tr -d '[:space:]') filas en ops.migracion"
  else
    echo "  FALLO al aplicar. Últimas líneas:"
    tail -20 /tmp/migraciones.log | sed 's/^/    /'
    exit 1
  fi
fi

echo "── 3 · contraseñas de los roles (desde docker/.env, sin imprimirlas) ──"
LECTOR=$(grep -m1 '^DATABASE_URL_LECTOR=' docker/.env | sed 's|.*://facylf_lector:||; s|@.*||')
PUBLICADOR=$(grep -m1 '^DATABASE_URL_PUBLICADOR=' docker/.env | sed 's|.*://facylf_publicador:||; s|@.*||')
if [ -n "$LECTOR" ] && [ -n "$PUBLICADOR" ]; then
  $PSQL -c "alter role facylf_lector password '$LECTOR'" >/dev/null && echo "  facylf_lector: contraseña puesta"
  $PSQL -c "alter role facylf_publicador password '$PUBLICADOR'" >/dev/null && echo "  facylf_publicador: contraseña puesta"
else
  echo "  no se pudieron leer las contraseñas de docker/.env"; exit 1
fi

echo "── 4 · comprobación de permisos ──"
echo "  roles: $($PSQL -c "select string_agg(rolname, ', ' order by rolname) from pg_roles where rolname like 'facylf%'" | tr -d '[:space:]')"
echo "  tablas en core: $($PSQL -c "select count(*) from information_schema.tables where table_schema = 'core'" | tr -d '[:space:]')"
echo "  tablas en ops:  $($PSQL -c "select count(*) from information_schema.tables where table_schema = 'ops'" | tr -d '[:space:]')"

# El rol de lectura tiene que poder leer y no poder escribir: es lo que la web verifica al arrancar.
LECTURA=$(docker exec -i "$CONTENEDOR" psql -U facylf_lector -d facylf -tAc "select count(*) from core.federation" 2>&1 | tr -d '[:space:]')
ESCRITURA=$(docker exec -i "$CONTENEDOR" psql -U facylf_lector -d facylf -tAc "create table core.prueba_lector(x int)" 2>&1 | tail -1 | tr -d '[:space:]' | cut -c1-40)
echo "  lector puede leer: ${LECTURA:-NO}"
echo "  lector intenta escribir: ${ESCRITURA:-?} (tiene que ser un error de permisos)"
