#!/bin/bash
# ── ¿QUÉ TEMPORADA ESTÁ SIRVIENDO DE VERDAD CADA RECOLECTOR? ─────────────────────────────────────────────
#
# La sospecha del 06/10/2026: en este proyecto `antiguedad = 100 - codigoTemporada`, así que una temporada más
# ANTIGUA tiene MÁS prioridad. Si eso es así, después de abrir el historial de la más reciente hacia atrás, la
# cola estaría sirviendo primero las más VIEJAS y dejando para el final las que se abrieron primero — justo al
# revés de lo que pidió David («empezando por la temporada pasada y la actual, y luego hacia atrás»).
#
# No se deduce del código: se MIRA. El registro del recolector escribe cada trabajo con su clave, y la clave
# lleva la temporada en segundo lugar (`acta|18|1234|...`). Así que basta contar las claves de las últimas
# líneas para saber qué está sirviendo cada uno.
#
# SÓLO LEE.
#
# Uso:  bash que-temporada-sirve.sh [federacion...]
set -u
FEDS="${*:-andalucia aragon asturias galicia federacion}"
for f in $FEDS; do
  c="facylf-${f}-1"
  log="/app/descargas-${f}/recolector-local/worker-programado.log"
  echo "════════ ${f} ════════"
  # Las claves de trabajo de las últimas 2000 líneas, contadas por temporada.
  docker exec "$c" sh -c "tail -2000 $log 2>/dev/null | grep -oE '^(→ |  ✓ )?(acta|jornada|calendario|clasificacion|indice_jornadas)\|[0-9]+' | grep -oE '[0-9]+$'" 2>/dev/null \
    | sort -n | uniq -c | sort -rn | head -6 | awk '{printf "    temporada %-4s %5s trabajos\n", $2, $1}'
  echo "    (si sale vacío, es que en esas 2000 líneas no había claves de trabajo)"
done
