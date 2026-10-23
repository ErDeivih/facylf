#!/bin/bash
# El compose de la base documenta `--env-file .env` (raíz), pero ese fichero NO existe: el entorno está en
# `docker/.env`. Así que el comando de la cabecera no arranca nada. Aquí se comprueba cuál funciona.
cd /srv/data/facylf || exit 1
echo "=== ¿DONDE ESTA POSTGRES_PASSWORD? ==="
for f in .env docker/.env infra/.env; do
  if [ -f "$f" ]; then
    n=$(grep -c '^POSTGRES_PASSWORD=' "$f" 2>/dev/null)
    printf '  %-14s existe, lineas POSTGRES_PASSWORD=%s\n' "$f" "$n"
  else
    printf '  %-14s NO existe\n' "$f"
  fi
done
echo
echo "=== VALIDAR CON docker/.env ==="
timeout 120 docker compose --env-file docker/.env -f infra/docker-compose.yml config >/dev/null 2>&1 \
  && echo "  VALIDA con --env-file docker/.env" \
  || { echo "  no valida:"; timeout 120 docker compose --env-file docker/.env -f infra/docker-compose.yml config 2>&1 | tail -4; }
echo
echo "=== ¿RECREARIA EL CONTENEDOR? (ensayo) ==="
timeout 180 docker compose --env-file docker/.env -f infra/docker-compose.yml --dry-run up -d 2>&1 | tail -5
echo
echo "=== ¿LA CLAVE DEL .env ES LA MISMA QUE LA DEL CONTENEDOR? ==="
enArchivo=$(grep '^POSTGRES_PASSWORD=' docker/.env 2>/dev/null | cut -d= -f2-)
enContenedor=$(timeout 25 docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' facylf-postgres 2>/dev/null | grep '^POSTGRES_PASSWORD=' | cut -d= -f2-)
if [ -n "$enArchivo" ] && [ "$enArchivo" = "$enContenedor" ]; then
  echo "  coinciden (el compose arrancaria la base con la clave correcta)"
else
  echo "  NO coinciden o falta: archivo='${enArchivo:0:6}...' contenedor='${enContenedor:0:6}...'"
fi
