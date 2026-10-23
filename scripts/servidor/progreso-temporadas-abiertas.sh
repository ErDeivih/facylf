#!/bin/bash
# ── ¿ESTÁ AVANZANDO LO QUE ABRÍ? ─────────────────────────────────────────────────────────────────────────
#
# El 06/10/2026 se devolvieron ~34.600 trabajos a la cola en catorce federaciones (temporadas aparcadas a
# 2099). Devolver trabajo a la cola no es el objetivo: el objetivo es que se HAGA. Esto enseña, por federación
# y por temporada abierta, cuántos trabajos hay hechos, pendientes y cuántos van apareciendo.
#
# Lee el fichero de temporadas asignadas —que es donde quedó apuntado lo que se abrió— y consulta esa
# temporada en concreto. SÓLO LEE.
#
# Uso:  bash progreso-temporadas-abiertas.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
Q=/srv/ssd/facylf/scripts/servidor/progreso-temporada.mjs

printf '%-20s %-6s %-9s %-9s %-9s %-9s %s\n' FEDERACION TEMP HECHOS PENDIENTE APLAZADO ACTAS_HECHAS ULTIMO_REGISTRO
for f in $FEDS; do
  c="facylf-${f}-1"
  asig="/app/descargas-${f}/recolector-local/temporadas-asignadas.txt"
  # `grep -v '^ *#'` no es cosmético: el fichero de CyL lleva comentarios explicativos, y sin saltarlos el
  # bucle trataba cada PALABRA como una temporada y sacaba una tabla absurda («temporada RECOGE», «temporada
  # SERVIDOR»). No rompía nada, pero el guion no servía para lo que existe: medir.
  temps=$(docker exec "$c" sh -c "grep -v '^ *#' $asig 2>/dev/null" 2>/dev/null | tr -d '\r' | awk 'NF' | awk '{print $1}')
  log="/app/descargas-${f}/recolector-local/worker-programado.log"
  ult=$(docker exec "$c" sh -c "tail -1 $log 2>/dev/null | cut -c1-40" 2>/dev/null)
  if [ -z "$temps" ]; then
    printf '%-20s %-6s %-9s %-9s %-9s %-9s %s\n' "$f" '-' '-' '-' '-' '-' "${ult:-?}"
    continue
  fi
  for t in $temps; do
    linea=$(docker exec "$c" node "$Q" "/app/descargas-${f}/recolector-local/cola-v2.sqlite" "$t" 2>/dev/null)
    # linea: hechos|pendiente|aplazado|actasHechas
    h=$(echo "$linea" | cut -d'|' -f1); p=$(echo "$linea" | cut -d'|' -f2)
    a=$(echo "$linea" | cut -d'|' -f3); ah=$(echo "$linea" | cut -d'|' -f4)
    printf '%-20s %-6s %-9s %-9s %-9s %-9s %s\n' "$f" "$t" "${h:-?}" "${p:-?}" "${a:-?}" "${ah:-?}" "${ult:-?}"
  done
done
