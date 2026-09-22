#!/usr/bin/env bash
# Corta la copia de seguridad en marcha (contenedores de copia + el guion padre) para poder desplegar una
# versión nueva del guion sin que el bash en ejecución lea líneas cambiadas por debajo.
#
# El nombre de ESTE fichero no contiene «copias.sh», así que `pgrep -f` no se encuentra a sí mismo.
set -uo pipefail

echo "── cortando contenedores de copia ──"
for id in $(docker ps -q); do
  cmd=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$cmd" in
    *copia-cola.mjs*) docker kill "$id" >/dev/null 2>&1 && echo "  cortado $id" ;;
  esac
done

echo "── cortando el guion padre ──"
for p in $(pgrep -f 'servidor/copias' 2>/dev/null); do
  [ "$p" = "$$" ] && continue
  kill "$p" 2>/dev/null && echo "  cortado pid $p"
done
sleep 1
echo "hecho"
