#!/usr/bin/env bash
# ¿Qué contenedor tiene la plaza, y el PID que hay en su ficha EXISTE dentro de los demás contenedores?
#
# Es la comprobación del fallo que se busca: las fichas de plaza guardan un identificador de proceso, y cada
# contenedor tiene su PROPIO espacio de identificadores (PID namespace). Así que el PID de la ficha de una
# federación puede existir —con otro significado— dentro de otro contenedor, y entonces la plaza parece viva
# cuando ya no lo está.
#
# Uso: bash docker/_plaza-y-namespaces.sh <contenedor> [<contenedor>...]
set -u
[ "$#" -gt 0 ] || { echo "hacen falta contenedores"; exit 1; }

echo "ficha de plaza:"
ficha=""
for f in /app/.estado-workers/slots-chrome/slot-*.lock; do
  [ -f "$f" ] || continue
  pid="$(cat "$f" 2>/dev/null)"
  echo "  $(basename "$f") = $pid"
  ficha="$pid"
done
[ -n "$ficha" ] || { echo "  (ninguna)"; exit 0; }

for c in "$@"; do
  if docker exec "$c" kill -0 "$ficha" 2>/dev/null; then
    echo "  ojo: el PID $ficha EXISTE también dentro de $c (espacios de identificadores distintos)"
  else
    echo "  el PID $ficha no existe dentro de $c"
  fi
done
