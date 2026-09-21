#!/usr/bin/env bash
# Enseña el registro de verdad de un recolector.
#
# El contenedor escribe su registro en un FICHERO, no en la salida estándar (por eso `docker logs`
# sale vacío aunque el worker esté trabajando):
#
#   descargas-<fed>/recolector-local/worker-programado.log
#
# Uso:
#   bash scripts/servidor/lee-registro.sh murcia          # últimas 40 líneas
#   bash scripts/servidor/lee-registro.sh murcia 200      # últimas 200
#   bash scripts/servidor/lee-registro.sh                 # resumen de las 19
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FEDERACIONES=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha \
  cataluna ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia)

fed="${1:-}"
lineas="${2:-40}"

if [ -z "$fed" ]; then
  printf '%-22s %8s %8s  %s\n' federación líneas tamaño último_escrito
  for f in "${FEDERACIONES[@]}"; do
    registro="$RAIZ/descargas-$f/recolector-local/worker-programado.log"
    if [ -f "$registro" ]; then
      printf '%-22s %8s %8s  %s\n' "$f" \
        "$(wc -l < "$registro")" \
        "$(du -h "$registro" | cut -f1)" \
        "$(date -r "$registro" '+%F %T')"
    else
      printf '%-22s %8s\n' "$f" 'sin registro'
    fi
  done
  exit 0
fi

registro="$RAIZ/descargas-$fed/recolector-local/worker-programado.log"
[ -f "$registro" ] || { echo "no hay registro para $fed en $registro"; exit 1; }
echo "── $registro · últimas $lineas líneas ──"
tail -n "$lineas" "$registro"
