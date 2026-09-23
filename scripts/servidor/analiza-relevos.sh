#!/usr/bin/env bash
# ── ¿POR QUÉ TERMINAN LAS SESIONES DE UNA FEDERACIÓN? ────────────────────────────────────────────────────
#
# El análisis de huecos (23/09/2026) enseñó que un TERCIO del reloj de Murcia se va en relevos: la sesión
# termina, se cierra Chrome, el supervisor espera y se abre otra. Eso NO aparece en la medición por fases,
# porque lo que no ocurre no se cronometra desde dentro de un trabajo.
#
# ── CÓMO SE LEE ESTE REGISTRO (y el error que cometí la primera vez) ─────────────────────────────────────
#
# El registro mezcla DOS tipos de línea:
#   · las del supervisor, que SÍ llevan fecha («2026-09-23 11:16:03  Arrancando o reanudando la ingesta.»);
#   · las del worker, que NO la llevan («→ acta|...», «  · reciclado de Chrome…», «  ✓ …»).
#
# Filtrar por fecha con `awk '$1" "$2 >= desde'` parece razonable y está MAL: una línea sin fecha empieza por
# «→» o por espacios, y esa cadena compara MAYOR que «2026-…», así que se cuelan todas. La primera versión de
# este guion contó así 5.863 trabajos en tres horas donde sólo hubo ~670. Por eso aquí se usan las líneas CON
# fecha como marcas y se cuentan los trabajos POR POSICIÓN, entre una marca y la siguiente.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/analiza-relevos.sh [federación] [horas]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FED=${1:-murcia}
HORAS=${2:-3}
LOG="$RAIZ/descargas-$FED/recolector-local/worker-programado.log"

[ -f "$LOG" ] || { echo "no existe el registro de $FED"; exit 1; }
DESDE=$(date -d "-$HORAS hours" '+%Y-%m-%d %H:%M:%S')

echo "══ relevos de $FED · últimas $HORAS h ══"
echo

awk -v desde="$DESDE" -v horas="$HORAS" '
  # ── POR QUÉ LA FECHA SE RECONOCE ASÍ Y NO CON /^[0-9]{4}-/ ─────────────────────────────────────────────
  #
  # El awk de Debian (mawk) no garantiza las expresiones de intervalo —`{4}`—, y cuando no las entiende la
  # regla NO casa y no avisa: la fecha se queda vacía, ninguna sesión entra en la ventana y el informe sale a
  # cero con toda naturalidad. Pasó al escribir esto. Se escribe el patrón carácter a carácter, que es
  # portátil y se lee igual de bien.
  /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] / {
    fecha = $1; hora = $2
  }

  # ── Arranque de sesión: se cierra la anterior y se abre la nueva ──
  /Arrancando o reanudando la ingesta/ {
    if (enSesion) cierra()
    enSesion = 1; inicioSesion = fecha " " hora; trabajos = 0; codigo = "-"; espera = "-"; esperas = 0
    next
  }

  /El worker termino con codigo/ {
    match($0, /codigo [-0-9]+/); codigo = substr($0, RSTART + 7, RLENGTH - 7)
    if (match($0, /intento en [0-9]+ s/)) espera = substr($0, RSTART + 11, RLENGTH - 13) + 0
    next
  }

  # Los trabajos se cuentan por POSICIÓN dentro de la sesión, no por fecha (no la llevan).
  /^→ / { if (enSesion) trabajos += 1; next }

  /esperando.*(plaza|para abrir Chrome)|turno de navegador/ { if (enSesion) esperas += 1; next }

  function cierra() {
    if (inicioSesion >= desde) {
      arranques += 1
      totalTrabajos += trabajos
      if (codigo != "0") noCero += 1
      if (espera != "-") { totalEspera += espera; nEsperas += 1; if (espera > maxEspera) maxEspera = espera }
      if (esperas > 0) sesionesConEspera += 1
    }
    enSesion = 0
  }

  END {
    if (enSesion) cierra()
    printf "  arranques de sesión en la ventana: %d\n", arranques
    if (arranques > 0) {
      printf "  trabajos hechos:                  %d\n", totalTrabajos
      printf "  trabajos por sesión:              %d\n", totalTrabajos / arranques
      printf "  sesiones por hora:                %.1f\n", arranques / horas
      printf "  sesiones que NO terminaron en 0:  %d\n", noCero
      printf "  sesiones con espera de plaza:     %d\n", sesionesConEspera
    }
    if (nEsperas > 0)
      printf "  espera del supervisor: %d veces · total %.1f min · media %.0f s · máxima %d s\n",
        nEsperas, totalEspera / 60, totalEspera / nEsperas, maxEspera
    else
      print "  espera del supervisor: ninguna registrada en la ventana"
  }
' "$LOG"
