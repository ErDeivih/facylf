#!/usr/bin/env bash
# Lista las plazas de navegador y la cola de espera del volumen compartido.
# Uso (dentro de un contenedor con el volumen montado en /app/.estado-workers):
#   bash /d/_lista-plazas.sh
set -u
carpeta="${1:-/app/.estado-workers/slots-chrome}"
echo "plazas en uso:"
for f in "$carpeta"/slot-*.lock; do
  [ -f "$f" ] || continue
  # La ficha guarda `pid contenedor` (el contenedor es opcional en fichas antiguas).
  echo "  $(basename "$f") = $(cat "$f" 2>/dev/null)"
done
echo "esperando turno:"
encontradas=0
for f in "$carpeta"/espera-*.ficha; do
  [ -f "$f" ] || continue
  echo "  $(basename "$f")"
  encontradas=$((encontradas + 1))
done
[ "$encontradas" -eq 0 ] && echo "  (nadie)"
exit 0
