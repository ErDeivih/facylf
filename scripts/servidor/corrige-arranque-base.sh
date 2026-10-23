#!/bin/bash
# EL COMANDO DE LA CABECERA CREARÍA UNA BASE NUEVA.
#
# El contenedor que corre se creó con el proyecto `facylf` (etiqueta
# `com.docker.compose.project=facylf`, working_dir /srv/data/facylf/infra). Al ejecutar `docker compose` desde
# `infra/` el proyecto por defecto es el nombre del directorio (`infra`), así que Docker no reconoce el
# contenedor como suyo y **crearía otro** —`infra-postgres-1`, con su propia red `infra_default` y su propio
# volumen—, dejando la base canónica de verdad a un lado. Eso es lo que aquí se comprueba y se corrige.
cd /srv/data/facylf || exit 1

echo "=== ENSAYO CON -p facylf (deberia no crear nada) ==="
timeout 180 docker compose -p facylf --env-file docker/.env -f infra/docker-compose.yml --dry-run up -d 2>&1 | tail -6
echo
echo "=== ENSAYO SIN -p (lo que dice la cabecera) ==="
timeout 180 docker compose --env-file docker/.env -f infra/docker-compose.yml --dry-run up -d 2>&1 | tail -4
echo
echo "=== CORREGIR LA CABECERA DEL FICHERO ==="
if grep -q 'docker compose --env-file .env -f infra/docker-compose.yml' infra/docker-compose.yml; then
  cp infra/docker-compose.yml /tmp/docker-compose.yml.antes
  sed -i 's|^# Arranque:  docker compose --env-file .env -f infra/docker-compose.yml up -d|# Arranque (DESDE LA RAÍZ DEL REPOSITORIO, con el proyecto `facylf` y el .env que existe):\n#   cd /srv/data/facylf \&\& docker compose -p facylf --env-file docker/.env -f infra/docker-compose.yml up -d\n#\n# OJO con las dos trampas, comprobadas el 26/09/2026:\n#   · sin `-p facylf` el proyecto es «infra» y Docker NO reconoce el contenedor que ya corre: crearía otro\n#     (infra-postgres-1), con su propia red y su propio volumen, dejando la base buena a un lado;\n#   · `--env-file .env` apunta a un fichero de la raíz que NO existe: el entorno está en `docker/.env`, y sin\n#     él el compose se niega a arrancar porque POSTGRES_PASSWORD es obligatoria.|' infra/docker-compose.yml
  echo "  cabecera corregida:"
  head -14 infra/docker-compose.yml | sed 's/^/    /'
else
  echo "  la cabecera ya estaba corregida o tiene otro texto:"
  head -6 infra/docker-compose.yml | sed 's/^/    /'
fi
echo
echo "=== EL ENSAYO BUENO, OTRA VEZ TRAS EL CAMBIO ==="
timeout 180 docker compose -p facylf --env-file docker/.env -f infra/docker-compose.yml --dry-run up -d 2>&1 | tail -3
echo
echo "=== LA BASE SIGUE ARRIBA (no hemos tocado nada de verdad) ==="
timeout 25 docker inspect -f '  {{.Name}} {{.State.Status}}' facylf-postgres 2>&1
