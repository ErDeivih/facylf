#!/usr/bin/env bash
# ── RITMO TOTAL DE LA FLOTA EN UNA VENTANA ───────────────────────────────────────────────────────────────
#
# Suma las peticiones que TODAS las federaciones han hecho en los últimos N minutos y lo deja en una línea,
# con la fecha. Sirve para comparar «antes y después» de un cambio: es la única forma honesta de saber si un
# ajuste ha subido el ritmo o sólo lo ha repartido de otra manera.
#
# Uso: bash scripts/servidor/mide-ritmo-total.sh [minutos]
set -uo pipefail

MINUTOS=${1:-15}
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
DESDE=$(date -u -d "@$(( $(date +%s) - MINUTOS * 60 ))" +%Y-%m-%dT%H:%M:%S.000Z)

TOTAL=$(docker run --rm -v "$RAIZ:/app" --entrypoint node facylf-recolectores:local \
  /app/scripts/servidor/exporta-peticiones.mjs "$DESDE" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" 2>/dev/null \
  | wc -l)

awk -v t="$TOTAL" -v m="$MINUTOS" 'BEGIN { printf "%s  %5d peticiones en %d min = %6.2f pet/min\n", strftime("%H:%M:%S"), t, m, t / m }'
