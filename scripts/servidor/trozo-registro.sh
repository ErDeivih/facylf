#!/usr/bin/env bash
# Enseña las líneas del registro del worker entre dos horas, para ver QUÉ estaba haciendo en un hueco.
#
# El registro mezcla líneas con fecha (las del supervisor) y sin fecha (las del worker), así que «entre las
# 12:28 y las 12:39» se resuelve llevando la cuenta de la última fecha vista: las líneas del worker que vienen
# detrás pertenecen a esa marca. Es la forma de leer un registro que no pone hora en todo.
#
# Uso: bash scripts/servidor/trozo-registro.sh <federación> <desde HH:MM:SS> <hasta HH:MM:SS> [fecha]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FED=${1:?falta la federación}
DESDE=${2:?falta la hora desde, por ejemplo 12:28:00}
HASTA=${3:?falta la hora hasta, por ejemplo 12:39:00}
DIA=${4:-$(date '+%Y-%m-%d')}
LOG="$RAIZ/descargas-$FED/recolector-local/worker-programado.log"

[ -f "$LOG" ] || { echo "no existe el registro de $FED"; exit 1; }

echo "══ $FED · registro entre $DESDE y $HASTA del $DIA ══"
echo

awk -v desde="$DIA $DESDE" -v hasta="$DIA $HASTA" '
  # Cada línea con fecha actualiza la marca de tiempo; las del worker heredan la última vista.
  /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] / { marca = $1 " " $2 }
  marca >= desde && marca <= hasta { print }
' "$LOG" | head -80
