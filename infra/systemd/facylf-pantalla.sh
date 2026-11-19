#!/usr/bin/env bash
# Apaga la pantalla del portatil de noche (22:00 a 09:00) sin parar el panel.
# Baja la RETROILUMINACION del panel (la consola va por KMS: el framebuffer y `setterm` no sirven).
#
# OJO: el brillo de partida se guarda SOLO si es mayor que cero. Si se guardaba tal cual y la pantalla ya
# estaba apagada, el fichero quedaba en 0 y el encendido de la mañana restauraba 0 (pasó el 19/11/2026:
# la pantalla no se encendió a las 09:00).
set -u
BL=/sys/class/backlight/intel_backlight
[ -d "$BL" ] || exit 0
max=$(cat "$BL/max_brightness" 2>/dev/null || echo 937)
case "${1:-}" in
  off)
    actual=$(cat "$BL/brightness" 2>/dev/null || echo 0)
    if [ "${actual:-0}" -gt 0 ] 2>/dev/null; then echo "$actual" > /run/facylf-brillo 2>/dev/null || true; fi
    echo 0 > "$BL/brightness" 2>/dev/null || true
    ;;
  on)
    valor=$(cat /run/facylf-brillo 2>/dev/null || echo 0)
    if [ "${valor:-0}" -le 0 ] 2>/dev/null; then valor=$max; fi
    echo "$valor" > "$BL/brightness" 2>/dev/null || true
    ;;
esac
exit 0
