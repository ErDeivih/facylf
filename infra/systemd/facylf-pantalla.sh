#!/usr/bin/env bash
# Apaga la pantalla del portatil de noche (22:00 a 09:00) sin parar el panel.
#
# Hay DOS mecanismos y hay que tocar los dos:
#   1. el brillo del panel (`/sys/class/backlight/intel_backlight/brightness`)
#   2. el DPMS del conector (`setterm --blank force` lo apaga y `--blank poke` lo despierta)
# El 19/11/2026 la pantalla no se encendio porque solo se restauro el brillo y el DPMS seguia en Off.
# `setterm` necesita un terminal: se le da /dev/tty1 por entrada y salida.
set -u
BL=/sys/class/backlight/intel_backlight
[ -d "$BL" ] || exit 0
max=$(cat "$BL/max_brightness" 2>/dev/null || echo 937)
case "${1:-}" in
  off)
    actual=$(cat "$BL/brightness" 2>/dev/null || echo 0)
    if [ "${actual:-0}" -gt 0 ] 2>/dev/null; then echo "$actual" > /run/facylf-brillo 2>/dev/null || true; fi
    echo 0 > "$BL/brightness" 2>/dev/null || true
    setterm --blank force --term linux < /dev/tty1 > /dev/tty1 2>/dev/null || true
    ;;
  on)
    valor=$(cat /run/facylf-brillo 2>/dev/null || echo 0)
    if [ "${valor:-0}" -le 0 ] 2>/dev/null; then valor=$max; fi
    echo "$valor" > "$BL/brightness" 2>/dev/null || true
    setterm --blank poke --term linux < /dev/tty1 > /dev/tty1 2>/dev/null || true
    ;;
esac
exit 0
