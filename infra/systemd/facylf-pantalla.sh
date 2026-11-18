#!/usr/bin/env bash
# Apaga la pantalla del portatil de noche (22:00 a 09:00) sin parar el panel.
# Se baja la RETROILUMINACION del panel, que es lo que de verdad apaga la pantalla; el framebuffer y
# `setterm` no servian en esta consola (va por KMS). Se guarda el brillo de partida para restaurarlo.
set -u
BL=/sys/class/backlight/intel_backlight
[ -d "$BL" ] || exit 0
case "${1:-}" in
  off)
    cat "$BL/brightness" > /run/facylf-brillo 2>/dev/null || true
    echo 0 > "$BL/brightness" 2>/dev/null || true
    ;;
  on)
    valor=$(cat /run/facylf-brillo 2>/dev/null || echo "")
    [ -n "$valor" ] || valor=$(cat "$BL/max_brightness" 2>/dev/null || echo 937)
    echo "$valor" > "$BL/brightness" 2>/dev/null || true
    ;;
esac
exit 0
