#!/bin/bash
# Comprueba que los recolectores CORREN de verdad, mirando su propio registro (no el del contenedor).
# Uso:  bash verifica-recolectores-corren.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
LOG=/app/descargas-%s/recolector-local/worker-programado.log

printf '%-20s %-9s %-9s %s\n' FEDERACION PROCESO PREVIO ULTIMO_ERROR
for f in $FEDS; do
  c="facylf-${f}-1"
  proc=$(docker exec "$c" sh -c 'ps aux | grep -c "[r]ecolector-local"' 2>/dev/null)
  prev=$(docker exec "$c" test -f /app/scripts/recolector-local.mjs.previo && echo si || echo no)
  log=$(printf "$LOG" "$f")
  err=$(docker exec "$c" grep -oE 'ERR_MODULE_NOT_FOUND|Cannot find module [^ ]*' "$log" 2>/dev/null | tail -1)
  [ -z "$err" ] && err='(ninguno)'
  printf '%-20s %-9s %-9s %s\n' "$f" "${proc:-0}" "$prev" "$err"
done
