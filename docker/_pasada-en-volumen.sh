#!/usr/bin/env bash
# Lado CONTENEDOR de la prueba: enlaza las colas que están en el volumen y lanza la pasada del fin de semana.
# Se usa con copias de las colas dentro de un volumen porque SQLite no funciona sobre carpetas de Windows
# compartidas con Docker (ver `_prueba-colas-en-volumen.sh`... que en realidad es este, renombrado).
#
# Uso (dentro del contenedor): bash /d/_pasada-en-volumen.sh canarias ceuta
set -eu
[ "$#" -gt 0 ] || { echo "hacen falta federaciones"; exit 1; }
cd /app
for fed in "$@"; do
  [ -d "/app/datos/descargas-$fed" ] || { echo "  falta /app/datos/descargas-$fed en el volumen"; exit 1; }
  ln -sfn "/app/datos/descargas-$fed" "/app/descargas-$fed"
done
node scripts/ingesta-fin-de-semana.mjs --federaciones "$(IFS=,; echo "$*")"
