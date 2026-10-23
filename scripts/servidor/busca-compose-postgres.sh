#!/bin/bash
# ¿Con qué fichero de compose se creó Postgres? Las etiquetas lo dicen; hay que leerlas enteras.
echo "=== ETIQUETAS DE COMPOSE DE POSTGRES ==="
for etiqueta in com.docker.compose.project com.docker.compose.service com.docker.compose.project.config_files com.docker.compose.project.working_dir; do
  printf '  %-45s %s\n' "$etiqueta" "$(timeout 25 docker inspect -f "{{index .Config.Labels \"$etiqueta\"}}" facylf-postgres 2>/dev/null)"
done
echo
echo "=== ¿EXISTEN ESOS FICHEROS? ==="
for f in /srv/data/facylf/docker/postgres.yml /srv/data/facylf/docker/base.yml /srv/data/facylf/docker/compose-base.yml /srv/data/facylf/docker/compose.yml; do
  if [ -f "$f" ]; then
    marca=$(grep -c 'facylf-postgres\|container_name: facylf-postgres' "$f" 2>/dev/null)
    printf '  %-45s existe (menciona postgres: %s)\n' "$f" "$marca"
  else
    printf '  %-45s NO existe\n' "$f"
  fi
done
echo
echo "=== ¿DÓNDE SE DEFINE? (buscando en el repo del servidor) ==="
grep -rl 'facylf-postgres' /srv/data/facylf/docker/ 2>/dev/null | head -5
grep -rl 'POSTGRES_DB' /srv/data/facylf/docker/ 2>/dev/null | head -5
echo
echo "=== SERVICIOS QUE DECLARA CADA FICHERO ==="
for f in /srv/data/facylf/docker/*.yml; do
  echo "  --- $f"
  grep -E '^  [a-z][a-z0-9-]*:' "$f" 2>/dev/null | sed 's/:/ /' | tr -d ' ' | tr '\n' ' '
  echo
done
