#!/bin/bash
# Integridad de las 16 colas del servidor después de desaparcar ~285.000 trabajos.
# SÓLO LEE. Uso: bash integridad-16.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
S=/srv/ssd/facylf/scripts/servidor/integridad-cola.mjs
malas=0
for f in $FEDS; do
  r=$(docker exec "facylf-${f}-1" node "$S" "/app/descargas-${f}/recolector-local/cola-v2.sqlite" 2>/dev/null)
  printf '  %-20s %s\n' "$f" "${r:-sin-respuesta}"
  [ "${r:-}" = "ok" ] || malas=$((malas + 1))
done
echo
if [ "$malas" = "0" ]; then echo "  ✓ las 16 colas pasan quick_check: no hay corrupción"
else echo "  ⚠ ${malas} colas con problema"; fi
