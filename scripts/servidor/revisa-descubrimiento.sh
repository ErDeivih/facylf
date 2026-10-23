#!/usr/bin/env bash
# ¿El DESCUBRIMIENTO de cada federación está funcionando o está fallando en bucle?
#
# Importa para decidir si hay que apartarlo. Que haya trabajos de fase 1 (calendarios, clasificaciones, grupos)
# disponibles delante de las actas NO es un problema por sí solo: puede ser trabajo productivo que va avanzando.
# Lo que sí es un problema es que ESE trabajo esté FALLANDO, porque entonces se elige una y otra vez y las actas
# —que sí se pueden descargar— no llegan a pedirse nunca.
#
# Este guion enseña, por federación, las peticiones de la última hora agrupadas por tipo y resultado. Con eso se
# ve de un vistazo si el descubrimiento avanza (`ok`) o se atasca (`sin_publicar`, `error`, `bloqueo`).
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/revisa-descubrimiento.sh [federación…]
set -uo pipefail

FEDS=("$@")
if [ "${#FEDS[@]}" -eq 0 ]; then
  FEDS=(andalucia galicia valencia madrid asturias federacion murcia cantabria)
fi

for fed in "${FEDS[@]}"; do
  echo "══ $fed ══"
  docker exec facylf-monitor node /app/scripts/servidor/diagnostica-federacion.mjs "$fed" 2>/dev/null \
    | sed -n '/peticiones en la última hora/,/^$/p' | sed '1d' | sed 's/^/  /'
done

echo '  Lectura: si lo que manda son «ok», el descubrimiento avanza y no hay que tocarlo.'
echo '  Si lo que manda es «sin_publicar», «error» o «bloqueo», ese trabajo se elige una y otra vez sin avanzar'
echo '  y está tapando las actas: se aparta con aparta-trabajos-atascados.mjs.'
