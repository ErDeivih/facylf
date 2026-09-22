#!/usr/bin/env bash
# ── ¿ESTÁ AVANZANDO LA COPIA DE SEGURIDAD? ──────────────────────────────────────────────────────────────
#
# La copia de las colas es un `VACUUM INTO` por federación dentro de un contenedor, y el resultado sólo se
# imprime al terminar cada una. Mientras corre, este guion dice si AVANZA: compara los bytes leídos y escritos
# del proceso con una pausa en medio. Si no se mueven, está encallada, y eso hay que saberlo antes de irse a
# dormir.
#
# Uso: bash scripts/servidor/vigila-copia.sh [segundos]
set -uo pipefail

PAUSA=${1:-20}
DESTINO=${FACYLF_COPIAS:-/srv/data/backups/facylf}
LOG=${FACYLF_LOG_COPIAS:-/srv/data/facylf/estado/copias.log}

bytes_de() {
  local p="$1" campo="$2"
  awk -v c="$campo" '$1 == c ":" { print $2 }' "/proc/$p/io" 2>/dev/null
}

foto() {
  local total=0
  for p in $(pgrep -f copia-cola.mjs 2>/dev/null); do
    local l e
    l=$(bytes_de "$p" read_bytes); e=$(bytes_de "$p" write_bytes)
    echo "  pid $p · leído ${l:-?} B · escrito ${e:-?} B"
  done
  [ -z "$(pgrep -f copia-cola.mjs 2>/dev/null)" ] && echo '  (ningún proceso de copia en marcha)'
}

echo "── $(date '+%F %T') ──"
echo "procesos de copia:"
foto
echo "copias ya escritas:"
ls -la "$DESTINO/colas" 2>/dev/null | tail -4 | sed 's/^/  /'
echo "últimas líneas del registro:"
tail -4 "$LOG" 2>/dev/null | sed 's/^/  /'

echo
echo "… esperando $PAUSA s …"
sleep "$PAUSA"
echo
echo "── $(date '+%F %T') ──"
foto
echo "copias escritas ahora:"
ls -la "$DESTINO/colas" 2>/dev/null | tail -4 | sed 's/^/  /'
echo "últimas líneas del registro:"
tail -4 "$LOG" 2>/dev/null | sed 's/^/  /'

echo
echo "── espacio ──"
df -h "$DESTINO" | awk 'NR == 2 { printf "  %s libres de %s (%s usado)\n", $4, $2, $5 }'
