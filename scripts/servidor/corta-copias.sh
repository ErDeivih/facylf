#!/usr/bin/env bash
# Corta los contenedores de copia de colas que se hayan quedado de una ejecución anterior.
# Sólo mata contenedores cuyo comando sea `copia-cola.mjs`: los recolectores usan la misma imagen.
set -uo pipefail
echo "── contenedores de copia en marcha ──"
encontrados=0
for id in $(docker ps -q); do
  cmd=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$cmd" in
    *copia-cola.mjs*)
      nombre=$(docker inspect -f '{{.Name}}' "$id")
      echo "  $id $nombre · $(docker inspect -f '{{.State.StartedAt}}' "$id")"
      encontrados=$((encontrados + 1))
      if [ "${1:-}" = "--cortar" ]; then
        docker kill "$id" >/dev/null 2>&1 && echo "    cortado"
      fi
      ;;
  esac
done
[ "$encontrados" = "0" ] && echo "  ninguno"
echo "  (usa --cortar para matarlos)"
