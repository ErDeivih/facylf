#!/bin/sh
# facylf · guardia de bateria
#
# Para que el servidor no se apague solo por exceso de carga: la bateria es el
# indicador bueno, porque el cargador no da para todo. Si la bateria baja, se baja
# el techo de CPU del slice de facylf; si se recupera, se repone. Con histeresis,
# para que no este subiendo y bajando cada minuto.
#
# Solo lee /sys y cambia una propiedad de systemd en caliente (--runtime), que no
# se guarda en disco y desaparece al reiniciar.
#
# Instalado por DeepSeek el 18/10/2026. Deshacer:
#   systemctl disable --now facylf-guardia-bateria.timer
#   systemctl set-property --runtime facylf.slice CPUQuota=250%

BAT=/sys/class/power_supply/BAT0/capacity
NIVEL=/run/facylf-guardia-bateria.nivel
Q_NORMAL=250%
Q_MEDIA=150%
Q_BAJA=100%

[ -r "$BAT" ] || exit 0
cap=$(cat "$BAT" 2>/dev/null)
case "$cap" in
  ''|*[!0-9]*) exit 0 ;;
esac

anterior=$(cat "$NIVEL" 2>/dev/null || echo NORMAL)
nuevo=$anterior

if [ "$cap" -lt 15 ]; then
  nuevo=BAJA
elif [ "$cap" -lt 30 ]; then
  nuevo=MEDIA
elif [ "$cap" -gt 60 ]; then
  nuevo=NORMAL
fi

[ "$nuevo" = "$anterior" ] && exit 0

case "$nuevo" in
  BAJA)  q=$Q_BAJA ;;
  MEDIA) q=$Q_MEDIA ;;
  *)     q=$Q_NORMAL ;;
esac

systemctl set-property --runtime facylf.slice CPUQuota=$q && {
  echo "$nuevo" > "$NIVEL"
  logger -t facylf-guardia "bateria ${cap}%: CPUQuota -> ${q} (antes ${anterior})"
}
