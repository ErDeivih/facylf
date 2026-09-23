#!/usr/bin/env bash
# ── ¿CUÁNTAS VECES SE REINICIA EL CONTENEDOR DE CADA FEDERACIÓN? ─────────────────────────────────────────
#
# El análisis de huecos dejaba un 40-55 % del reloj en espacios de más de un minuto, y al mirar el registro de
# uno de ellos apareció la causa: **«Contenedor parado; se cierra el navegador y se suelta la plaza»**, que es la
# línea que escribe el lanzador cuando el contenedor recibe la orden de pararse. No es un relevo de sesión
# dentro del worker —eso dura 20 s— sino un REINICIO DEL CONTENEDOR: cerrar Chrome, arrancarlo otra vez, pedir
# plaza, preparar el plan local. Eso son minutos, cada vez.
#
# Este guion cuenta tres cosas distintas que es fácil confundir, y las pone por federación:
#
#   · «Arrancando o reanudando la ingesta» → arranques del WORKER (relevos de sesión, baratos);
#   · «Supervisor en contenedor iniciado»  → arranques del CONTENEDOR (caros: Chrome y plaza de nuevo);
#   · «Contenedor parado»                  → cuántas veces se ha parado (y por tanto reiniciado) el contenedor.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/cuenta-reinicios-contenedor.sh [horas]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
HORAS=${1:-3}
DESDE=$(date -d "-$HORAS hours" '+%Y-%m-%d %H:%M:%S')

echo "════ REINICIOS DE CONTENEDOR · últimas $HORAS h ════"
printf '  %-22s %10s %12s %12s %12s\n' federación arranques arranques "PARADAS" "paradas/h"
printf '  %-22s %10s %12s %12s %12s\n' "" worker contenedor "" ""

for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}; fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac

  # Líneas con fecha dentro de la ventana. Sólo se usan frases que SIEMPRE llevan fecha, así que el filtro es
  # fiable (el error de contar líneas sin fecha ya se cometió una vez en este proyecto).
  ventana=$(awk -v d="$DESDE" '$1 ~ /^[0-9][0-9][0-9][0-9]-/ && $1" "$2 >= d' "$f" 2>/dev/null)

  arranquesWorker=$(printf '%s\n' "$ventana" | grep -c 'Arrancando o reanudando la ingesta')
  arranquesContenedor=$(printf '%s\n' "$ventana" | grep -c 'Supervisor en contenedor iniciado')
  paradas=$(printf '%s\n' "$ventana" | grep -c 'Contenedor parado')

  aviso=''
  if [ "$paradas" -ge 5 ]; then aviso='  ← SE REINICIA MUCHO'; fi
  printf '  %-22s %10s %12s %12s %12s%s\n' "$fed" "$arranquesWorker" "$arranquesContenedor" "$paradas" \
    "$(awk -v p="$paradas" -v h="$HORAS" 'BEGIN { printf "%.1f", p / h }')" "$aviso"
done

echo
echo '  Un reinicio de contenedor cuesta, medido: cerrar Chrome, volver a pedir plaza y abrir otro, más la'
echo '  preparación local del plan (plan, vigilancia, repriorización). Son minutos por reinicio, y en ese rato'
echo '  la federación no pide NADA. Si «paradas/h» es alto, ese es el agujero — no el ciclo del worker.'
echo
echo '  Para saber QUIÉN los para: `journalctl -u docker` en esa franja, o mirar si el contenedor murió por'
echo '  memoria (`docker inspect <c> --format "{{.State.OOMKilled}} {{.RestartCount}}"`).'
