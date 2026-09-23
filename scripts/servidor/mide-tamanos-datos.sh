#!/usr/bin/env bash
# Mide cuánto ocupa CADA federación, separando la cola del archivo, y deja el resultado en un fichero.
#
# Va en segundo plano a propósito: recorrer el archivo son cientos de miles de ficheros pequeños en un disco
# duro, y hacerlo en primer plano bloquea cualquier otra comprobación. Deja el resultado en
# /tmp/tamanos-datos.txt y se puede ir mirando.
#
# SÓLO LEE.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
SALIDA=${1:-/tmp/tamanos-datos.txt}

{
  echo "federacion,cola_mb,local_mb,archivo_mb,otros_dir_mb"
  for d in "$RAIZ"/descargas-*/; do
    [ -d "$d" ] || continue
    fed=$(basename "$d"); fed=${fed#descargas-}
    case "$fed" in prueba*|*-sondeo) continue ;; esac
    local_dir="$d/recolector-local"
    [ -d "$local_dir" ] || continue

    cola=$(du -sm "$local_dir"/cola-v2.sqlite* 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
    total=$(du -sm "$local_dir" 2>/dev/null | awk '{ print $1 + 0 }')
    # El archivo: carpetas de temporada (t21-2025-26, etc.) y el catálogo.
    archivo=$(du -sm "$local_dir"/t[0-9]* 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
    otros=$(( total - cola - archivo ))
    echo "$fed,$cola,$total,$archivo,$otros"
    # Se escribe la línea a la vez, para poder seguir el avance.
    echo "  $fed: cola ${cola} MB · total ${total} MB · archivo ${archivo} MB" >&2
  done
} > "$SALIDA" 2> "${SALIDA}.avance"

echo "terminado: $SALIDA"
