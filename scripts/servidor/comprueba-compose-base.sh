#!/bin/bash
# La base canónica SÍ tiene compose: `infra/docker-compose.yml` (servicio `postgres`, proyecto `facylf`).
# Ayer lo busqué sólo en `docker/*.yml` y dije que no existía: error mío. Este guion comprueba que el comando
# documentado es seguro (que NO recrea el contenedor, sólo lo arranca si está parado).
cd /srv/data/facylf || exit 1
echo "=== ¿ESTA LA CLAVE QUE EL COMPOSE EXIGE? ==="
grep -c '^POSTGRES_PASSWORD=' .env 2>/dev/null | sed 's/^/  POSTGRES_PASSWORD en .env de la raiz: /'
grep -c '^POSTGRES_PASSWORD=' docker/.env 2>/dev/null | sed 's/^/  POSTGRES_PASSWORD en docker/.env:     /'
echo
echo "=== VALIDAR EL COMPOSE (sin tocar nada) ==="
timeout 120 docker compose --env-file .env -f infra/docker-compose.yml config >/dev/null 2>&1 \
  && echo "  el fichero es valido" || { echo "  NO valida:"; timeout 120 docker compose --env-file .env -f infra/docker-compose.yml config 2>&1 | tail -5; }
echo
echo "=== ¿QUE HARIA UN 'up -d'? (ensayo, no lo hace) ==="
timeout 180 docker compose --env-file .env -f infra/docker-compose.yml --dry-run up -d 2>&1 | tail -6
echo
echo "=== SI HUBIERA QUE ARRANCARLO DE VERDAD ==="
cat <<'FIN'

  cd /srv/data/facylf
  docker compose --env-file .env -f infra/docker-compose.yml up -d

  (Es el comando que ya documenta la cabecera de ese fichero. Con el contenedor ya creado, sólo lo arranca:
   no lo recrea, así que no toca los datos ni el volumen `facylf_facylf-pg`.)

  Y para la web y el importador, que sí viven en docker/:

  docker compose -p facylf --env-file docker/.env -f docker/web.yml up -d
  docker compose -p facylf --env-file docker/.env -f docker/importador.yml up -d
  docker compose -p docker --env-file docker/.env -f docker/monitor.yml up -d

FIN
echo "=== ESTADO AHORA ==="
timeout 25 docker inspect -f '  postgres: {{.State.Status}} desde {{.State.StartedAt}} (reinicio: {{.HostConfig.RestartPolicy.Name}})' facylf-postgres 2>&1
