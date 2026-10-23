#!/bin/bash
# ── T-03 (1ª parte) · RECUENTO de lo cancelado por fallos de red, SIN aplicar ──────────────────────────────
#
# `reabre-cancelados-por-red.mjs` sin `--aplicar` abre la cola EN SÓLO LECTURA y sólo cuenta. Con `--aplicar`
# escribe, y exige tener el recolector de esa federación parado.
#
# Aquí SÓLO se cuenta, en las 16 federaciones del servidor. El resultado se apunta y se decide después.
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
total=0
for f in $FEDS; do
  salida=$(docker exec "facylf-$f-1" node --no-warnings /app/scripts/claude/reabre-cancelados-por-red.mjs \
    "/app/descargas-$f/recolector-local/cola-v2.sqlite" 2>&1)
  n=$(printf '%s' "$salida" | grep -oE '[0-9]+' | head -1)
  [ -z "$n" ] && n=0
  total=$((total + n))
  printf '  %-20s %s\n' "$f" "$(printf '%s' "$salida" | tr '\n' ' ' | cut -c1-110)"
done
echo "  ────────────────────────────────────────"
echo "  TOTAL candidatos en el servidor: $total"
