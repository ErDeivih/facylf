#!/usr/bin/env bash
# La pasada del fin de semana, dentro del contenedor y sin cron.
#
# Un bucle calcula cuántos segundos faltan para la hora fijada (07:30 de Madrid por defecto) y duerme hasta
# entonces. Es más simple que instalar cron en la imagen y más fácil de leer en los registros: una línea por
# pasada, con su fecha y su resultado.
#
# Uso: entrada-fin-de-semana.sh [hora HH:MM] [federaciones separadas por comas]
set -u
hora_objetivo="${1:-${FACYLF_HORA_FINDE:-07:30}}"
federaciones="${2:-${FACYLF_FEDERACIONES:-}}"
raiz="/app"
registro="$raiz/pruebas/reconstruccion/fin-de-semana-programado.log"
mkdir -p "$(dirname "$registro")"

echo "$(date '+%F %T')  Pasada del fin de semana programada a las $hora_objetivo (hora de Madrid)." >> "$registro"

while true; do
  ahora="$(date '+%s')"
  # Cuántos segundos faltan para la hora objetivo de HOY (o de mañana si ya ha pasado).
  objetivo="$(date -d "today $hora_objetivo" '+%s' 2>/dev/null || echo "$((ahora + 3600))")"
  [ "$objetivo" -le "$ahora" ] && objetivo="$(date -d "tomorrow $hora_objetivo" '+%s')"
  espera=$((objetivo - ahora))
  echo "$(date '+%F %T')  Durmiendo $espera s hasta la siguiente pasada." >> "$registro"
  sleep "$espera"

  echo "$(date '+%F %T')  --- pasada del fin de semana ---" >> "$registro"
  if [ -n "$federaciones" ]; then
    node "$raiz/scripts/ingesta-fin-de-semana.mjs" --federaciones "$federaciones" >> "$registro" 2>&1
  else
    node "$raiz/scripts/ingesta-fin-de-semana.mjs" >> "$registro" 2>&1
  fi
  echo "$(date '+%F %T')  --- fin (codigo $?) ---" >> "$registro"
done
