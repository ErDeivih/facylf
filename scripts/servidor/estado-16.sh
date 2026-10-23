#!/bin/bash
# ── ESTADO REAL DE LOS 16 RECOLECTORES DEL SERVIDOR ──────────────────────────────────────────────────────
#
# Responde a la pregunta que dejó abierta la ronda 3: los cuatro contenedores que muestran
# `ERR_MODULE_NOT_FOUND` ¿están rotos AHORA o es el último error de un registro viejo?
#
# La diferencia importa y ya me confundió una vez: el registro guarda la historia, y buscar «la última línea
# que dice error» encuentra errores de antes del arreglo. Así que aquí se saca **la fecha** de la última línea
# del registro y la del último error, y se ve de un vistazo si el error es de antes o de después.
#
# También cuenta las actas que están guardadas y NO tienen trabajo (`actasSinTrabajo`): era 1.722 en el
# servidor antes de desplegar `reparaActasSinTrabajo`, y deberían haber bajado.
#
# SÓLO LEE.
#
# Uso:  bash estado-16.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

printf '%-20s %-7s %-9s %-16s %-9s %-8s %s\n' FEDERACION PROC ULT_REG ULT_ERROR ERA_ERR PEND HUERF
for f in $FEDS; do
  c="facylf-${f}-1"
  log="/app/descargas-${f}/recolector-local/worker-programado.log"
  proc=$(docker exec "$c" sh -c 'ps aux | grep -c "[r]ecolector-local"' 2>/dev/null)
  ult=$(docker exec "$c" sh -c "tail -1 $log 2>/dev/null | cut -c1-16" 2>/dev/null)
  errline=$(docker exec "$c" sh -c "grep -nE 'ERR_MODULE_NOT_FOUND|Cannot find module' $log 2>/dev/null | tail -1" 2>/dev/null)
  if [ -z "$errline" ]; then err='-'; era='-'; else err=$(echo "$errline" | cut -c1-30); era='si'; fi
  json=$(docker exec "$c" node /srv/ssd/facylf/scripts/diagnostica-trabajo-cola.mjs "/app/descargas-${f}/recolector-local/cola-v2.sqlite" "$f" 2>/dev/null)
  pend=$(echo "$json" | grep -o '"pendienteAhora":[0-9]*' | cut -d: -f2)
  huerf=$(echo "$json" | grep -o '"actasSinTrabajo":[0-9]*' | cut -d: -f2)
  printf '%-20s %-7s %-9s %-16s %-9s %-8s %s\n' "$f" "${proc:-0}" "${ult:-?}" "$err" "$era" "${pend:-?}" "${huerf:-?}"
done
