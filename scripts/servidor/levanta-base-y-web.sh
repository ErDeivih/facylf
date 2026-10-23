#!/bin/bash
# LEVANTAR LA PLATAFORMA ENTERA, cada pieza con EL fichero y el proyecto que le corresponden.
#
# POR QUÉ NO ES UN SOLO COMANDO (comprobado el 26/09/2026):
#   · cada pieza vive en su propio fichero de compose y bajo un proyecto DISTINTO, y equivocarse de proyecto
#     no da error: **crea contenedores nuevos** en vez de arrancar los que ya existen;
#   · la base está en `infra/docker-compose.yml` con el proyecto `facylf`, y su `.env` es `docker/.env`
#     (`--env-file .env` apunta a un fichero de la raíz que no existe);
#   · el monitor va con su propio proyecto, `docker` (el nombre del directorio del fichero), no `facylf`.
#
# Uso:  bash levanta-todo.sh            (comprueba y levanta lo que falte)
#       bash levanta-todo.sh --ensayo   (sólo dice lo que haría, sin tocar nada)
cd /srv/data/facylf || exit 1
ENSAYO=""
[ "$1" = "--ensayo" ] && ENSAYO="--dry-run"

echo "=== ESTADO ANTES ==="
for c in facylf-postgres facylf-web facylf-importador facylf-monitor; do
  printf '  %-22s %s\n' "$c" "$(timeout 25 docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo 'no existe')"
done

echo
echo "=== LEVANTAR (proyecto facylf: base, web, importador) ==="
timeout 300 docker compose -p facylf --env-file docker/.env -f infra/docker-compose.yml $ENSAYO up -d 2>&1 | grep -vE 'level=warning' | tail -3
timeout 300 docker compose -p facylf --env-file docker/.env -f docker/web.yml $ENSAYO up -d 2>&1 | grep -vE 'level=warning' | tail -3
timeout 300 docker compose -p facylf --env-file docker/.env -f docker/importador.yml $ENSAYO up -d 2>&1 | grep -vE 'level=warning' | tail -3

echo
echo "=== LEVANTAR (proyecto docker: el monitor) ==="
timeout 300 docker compose -p docker --env-file docker/.env -f docker/monitor.yml $ENSAYO up -d 2>&1 | grep -vE 'level=warning' | tail -3

echo
echo "=== LEVANTAR LOS RECOLECTORES (con sus turnos y cuotas) ==="
timeout 900 docker compose -p facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml $ENSAYO up -d 2>&1 | grep -E 'Started|Created|Running|Error' | tail -8

echo
echo "=== ESTADO DESPUES ==="
for c in facylf-postgres facylf-web facylf-importador facylf-monitor; do
  printf '  %-22s %s\n' "$c" "$(timeout 25 docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo 'no existe')"
done
echo -n "  recolectores en marcha: "
arriba=0
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja; do
  s=$(timeout 20 docker inspect -f '{{.State.Status}}' "facylf-$fed-1" 2>/dev/null)
  [ "$s" = "running" ] && arriba=$((arriba+1))
done
echo "$arriba de 16 (cataluna, madrid y valencia las recoge el PC)"
uptime
