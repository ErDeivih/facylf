#!/usr/bin/env bash
# Lado CONTENEDOR: enlaza la cola que está en el volumen y arranca el supervisor normal.
#
# Sirve para probar en el PC, donde las colas no pueden montarse desde Windows (SQLite sobre 9p no abre una base
# WAL: ver `_copia-colas-a-volumen.sh`). En el servidor no hace falta: el compose monta las colas del host.
#
# Uso: bash /d/_entrada-en-volumen.sh <federacion>
set -eu
fed="${1:?falta la federación}"
if [ -d "/app/datos/descargas-$fed" ] && [ ! -e "/app/descargas-$fed" ]; then
  ln -sfn "/app/datos/descargas-$fed" "/app/descargas-$fed"
fi
exec bash /app/docker/entrada-recolector.sh "$fed"
