#!/usr/bin/env bash
# Copia colas del PC a un volumen de Docker, para poder probarlas desde un contenedor.
#
# ── POR QUÉ HACE FALTA ESTO EN WINDOWS ─────────────────────────────────────────────────────────────────
#
# Docker Desktop comparte las carpetas de Windows con el contenedor por 9p/virtiofs, y a través de ese puente
# SQLite NO puede abrir las colas: con la base en WAL y su fichero `-shm` vivo, la apertura falla con «disk I/O
# error» o «unable to open database file» (comprobado el 18/09/2026, leyendo y escribiendo). En un servidor
# Debian las colas están en el sistema de ficheros Linux —volumen o carpeta de ext4— y no hay tal problema: la
# misma cola leída desde un VOLUMEN de Docker funciona a la primera.
#
# Así que el compose de producción monta las colas del host directamente (correcto en Linux), y para probar en
# el PC se copian a un volumen con este guion.
#
# Uso: bash docker/_copia-colas-a-volumen.sh <volumen> <federacion> [<federacion>...]
set -eu
volumen="${1:?falta el volumen, por ejemplo facylf-datos-prueba}"
shift
[ "$#" -gt 0 ] || { echo "hacen falta federaciones"; exit 1; }

raiz="$(cd "$(dirname "$0")/.." && pwd)"
# Git Bash da rutas tipo /f/... y Docker las acepta; si se ejecuta desde WSL, se usa la ruta tal cual.
origen_de() { echo "$raiz/descargas-$1"; }

for fed in "$@"; do
  echo "  copiando descargas-$fed a $volumen"
  docker run --rm \
    -v "$(origen_de "$fed")":/origen \
    -v "$volumen":/destino \
    --entrypoint bash facylf-recolectores:local \
    -c "mkdir -p /destino/descargas-$fed && cp -a /origen/. /destino/descargas-$fed/"
done
echo "  listo: dentro del contenedor están en /app/datos/descargas-<federación>"
