#!/usr/bin/env bash
# ── LA FOTO COMPLETA DEL SERVIDOR EN UNA PANTALLA ───────────────────────────────────────────────────────
#
# Reúne lo que hay que mirar para saber si la máquina está sana, sin encadenar diez órdenes a mano:
# espacio, memoria, carga, flota (cuántas piden, cuántas esperan, cuántas sin trabajo), plazas, importador,
# canónico, copias de seguridad y web. Todo de SÓLO LECTURA.
#
# Uso: bash scripts/servidor/estado-general.sh
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
ENV="$RAIZ/docker/.env"
UMBRAL_SIN_PEDIR=${1:-15}

linea() { printf '%s\n' "${1:-}"; }

linea '════════════════════════ SERVIDOR ════════════════════════'
linea "  cuándo:   $(date '+%F %T')"
linea "  sistema:  $(uptime | sed 's/.*up //')"
linea "  núcleos:  $(nproc)"
linea "  memoria:  $(free -m | awk 'NR==2 { printf "%s MB usados de %s · %s MB disponibles", $3, $2, $7 }')"
linea "  disco:    $(df -h "$RAIZ" | awk 'NR==2 { printf "%s libres de %s (%s usado)", $4, $2, $5 }')"
linea

linea '── FLOTA ──'
# El host NO tiene Node: los resúmenes se leen dentro del contenedor del monitor, que ya lleva el repositorio.
if [ -f "$RAIZ/estado/colas.json" ]; then
  docker exec facylf-monitor node /app/scripts/servidor/resume-colas.mjs /app/estado/colas.json 2>/dev/null \
    || linea '  (no se pudo leer colas.json: ¿está el monitor en marcha?)'
else
  linea "  (no existe $RAIZ/estado/colas.json: ¿está el monitor en marcha?)"
fi

memoria=$(grep -E '^FACYLF_MEMORIA_GB=' "$ENV" 2>/dev/null | cut -d= -f2); memoria=${memoria:-10}
reserva=$(grep -E '^FACYLF_RESERVA_GB=' "$ENV" 2>/dev/null | cut -d= -f2); reserva=${reserva:-1.5}
linea "  plazas de navegador: $(awk -v m="$memoria" -v r="$reserva" 'BEGIN { printf "%d", (m - r) / 0.75 }')"
ocupadas=$(docker run --rm -v facylf_plazas:/p alpine sh -c 'ls /p/slots-chrome/slot-*.lock 2>/dev/null | wc -l' 2>/dev/null || echo '?')
esperando=$(docker run --rm -v facylf_plazas:/p alpine sh -c 'ls /p/slots-chrome/espera-*.lock 2>/dev/null | wc -l' 2>/dev/null || echo '?')
linea "  ocupadas ahora: $ocupadas · esperando: $esperando"
linea

linea '── IMPORTADOR Y CANÓNICO ──'
if [ -f "$RAIZ/estado/importacion-resumen.json" ]; then
  docker exec facylf-monitor node /app/scripts/servidor/resume-importacion.mjs /app/estado/importacion-resumen.json 2>/dev/null \
    || linea '  (no se pudo leer el resumen del importador)'
else
  linea '  (sin resumen del importador)'
fi
[ -f "$RAIZ/estado/canonico.txt" ] && linea "  canónico: $(tr '\n' ' ' < "$RAIZ/estado/canonico.txt")"
linea

linea '── COPIAS DE SEGURIDAD ──'
if [ -f "$RAIZ/estado/copias.log" ]; then
  tail -2 "$RAIZ/estado/copias.log" | sed 's/^/  /'
else
  linea '  (sin registro de copias)'
fi
ls -1 "$RAIZ"/copias/*.dump 2>/dev/null | tail -2 | sed 's/^/  /' || true
linea

linea '── WEB ──'
# Se prueba contra la dirección de ESCUCHA del .env, no contra 127.0.0.1: la web está atada a la IP de la
# tailnet, así que desde el propio host `127.0.0.1:3100` no responde (y parecía una avería sin serlo).
bind=$(grep -E '^FACYLF_WEB_BIND=' "$ENV" 2>/dev/null | cut -d= -f2)
bind=${bind:-127.0.0.1:3100}
codigo=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$bind/" 2>/dev/null || echo '000')
linea "  $bind → HTTP ${codigo:-000}"
