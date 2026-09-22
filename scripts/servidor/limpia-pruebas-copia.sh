#!/usr/bin/env bash
# Limpia los restos de las PRUEBAS de copia: contenedores huérfanos que quedaron de ejecuciones cuyas sesiones
# murieron, y que siguen consumiendo disco y procesador sin que nadie los espere.
#
# Qué se corta y qué NO:
#   · SÍ: contenedores que ejecutan `/p.mjs` (las pruebas de medida) y los `docker run` huérfanos de pruebas;
#   · NO: el contenedor de la copia de seguridad EN CURSO (`/app/scripts/servidor/copia-cola.mjs`), que sí
#     interesa. Para cortar también ese, está `para-copias.sh`.
set -uo pipefail

echo "── contenedores de prueba (se cortan) ──"
for id in $(docker ps -q); do
  cmd=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$cmd" in
    *"/p.mjs"*|*prueba-verificacion*|*prueba-backup*)
      echo "  $id · $(docker inspect -f '{{.State.StartedAt}}' "$id") · $cmd"
      docker kill "$id" >/dev/null 2>&1 && echo "    cortado"
      ;;
  esac
done

echo "── procesos huérfanos de docker run (padre 1) ──"
for p in $(ps -eo pid,ppid,args | awk '$2 == 1 && /docker run/ { print $1 }'); do
  args=$(tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null)
  case "$args" in
    *copia-cola.mjs*) echo "  $p es de la copia en curso: se respeta" ;;
    *docker\ run*)
      echo "  $p · ${args:0:100}"
      kill -9 "$p" 2>/dev/null && echo "    cortado"
      ;;
  esac
done

echo "── procesos huérfanos de las pruebas de medida ──"
for p in $(pgrep -f 'prueba-verificacion|prueba-backup' 2>/dev/null); do
  echo "  $p · $(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-90)"
  kill -9 "$p" 2>/dev/null && echo "    cortado"
done

echo
echo "── lo que queda ──"
for id in $(docker ps -q); do
  cmd=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$cmd" in
    *copia-cola.mjs*) echo "  copia en curso: $id · $(docker inspect -f '{{.State.StartedAt}}' "$id")" ;;
  esac
done
echo "  guiones de copia en marcha: $(pgrep -fc 'servidor/copias')"
