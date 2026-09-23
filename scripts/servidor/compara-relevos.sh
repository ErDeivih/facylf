#!/usr/bin/env bash
# Compara en varias federaciones cuánto del reloj se va en relevos de sesión, para saber si es un problema
# general o de una federación concreta.
#
# Importa distinguirlo: Murcia se ha recreado varias veces a mano durante las mediciones, así que sus relevos
# incluyen los que provocaron esas recreaciones. Una federación que nadie ha tocado es la única que dice la
# verdad sobre lo que hace la flota por sí sola.
#
# Uso: bash scripts/servidor/compara-relevos.sh [horas] [federación…]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
HORAS=${1:-3}
shift || true
FEDS=("$@")
if [ "${#FEDS[@]}" -eq 0 ]; then
  FEDS=(andalucia navarra asturias galicia extremadura)
fi

printf '  %-16s %10s %8s %8s %8s\n' federación "ritmo real" "relevos" "paradas" "perdido"
for fed in "${FEDS[@]}"; do
  salida=$(docker run --rm -v "$RAIZ:/app" --entrypoint node facylf-recolectores:local \
    /app/scripts/servidor/analiza-huecos-federacion.mjs "$fed" "$HORAS" 2>/dev/null)
  [ -z "$salida" ] && { printf '  %-16s (sin datos)\n' "$fed"; continue; }

  ritmo=$(printf '%s' "$salida" | sed -n 's/.*ritmo real: \([0-9]*\) pet\/h.*/\1/p')
  relevo=$(printf '%s' "$salida" | sed -n 's/.*relevo largo (1-5 min) *\([0-9.]*\) *\([0-9]*\) %.*/\2/p' | head -1)
  parada=$(printf '%s' "$salida" | sed -n 's/.*parada (> 5 min) *\([0-9.]*\) *\([0-9]*\) %.*/\2/p' | head -1)
  perdido=$(printf '%s' "$salida" | sed -n 's/.*de más de un minuto se llevan [0-9.]* min.*(\([0-9]*\) %).*/\1/p' | head -1)

  printf '  %-16s %10s %7s%% %7s%% %7s%%\n' "$fed" "${ritmo:-—}" "${relevo:-—}" "${parada:-—}" "${perdido:-—}"
done

echo
echo '  «perdido» = porcentaje del reloj en huecos de más de un minuto (relevos de sesión, no ciclo del worker).'
echo '  Ese tiempo NO se puede recuperar optimizando el ciclo: la federación no está trabajando.'
