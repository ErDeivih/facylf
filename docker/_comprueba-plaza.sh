#!/usr/bin/env bash
# Comprueba que la plaza de navegador se suelta al parar el contenedor.
# Uso: bash docker/_comprueba-plaza.sh <nombre-contenedor> <volumen>
set -u
contenedor="${1:?falta el contenedor}"
volumen="${2:?falta el volumen}"

echo "  plazas ANTES de parar:"
docker exec "$contenedor" bash -c 'ls -A /app/.estado-workers/slots-chrome/ 2>/dev/null | while read -r f; do echo "    $f = $(cat "/app/.estado-workers/slots-chrome/$f" 2>/dev/null)"; done'

docker stop "$contenedor" >/dev/null 2>&1
sleep 6

echo "  plazas DESPUÉS de parar:"
docker run --rm -v "$volumen":/p --entrypoint bash facylf-recolectores:local -c 'n=$(ls -A /p/slots-chrome/ 2>/dev/null | wc -l); echo "    quedan $n fichero(s)"; ls -A /p/slots-chrome/ 2>/dev/null | sed "s/^/    /"'
