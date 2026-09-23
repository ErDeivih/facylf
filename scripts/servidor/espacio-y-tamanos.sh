#!/usr/bin/env bash
# ¿Dónde hay sitio y qué ocupa qué? Es la pregunta previa a mover datos de disco.
#
# El servidor tiene DOS discos: `/srv/data` es un disco DURO (`/dev/sdb1`) y `/` es un SSD. Las colas SQLite y
# el archivo de HTML viven en el disco duro, y ahí es donde se va el tiempo de escritura. Antes de mover nada
# hay que saber cuánto ocupa cada cosa y cuánto cabe en el SSD.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/espacio-y-tamanos.sh
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '════ DISCOS ════'
df -h / /srv/data 2>/dev/null | sed 's/^/  /'
echo
echo '  qué dispositivo es cada uno:'
findmnt -no SOURCE,FSTYPE,SIZE,AVAIL / 2>/dev/null | sed 's/^/    \/        → /'
findmnt -no SOURCE,FSTYPE,SIZE,AVAIL "$RAIZ" 2>/dev/null | sed 's/^/    \/srv\/data → /'
echo

echo '════ QUÉ OCUPA CADA COSA ════'
echo '  (MB)  cola SQLite   archivo HTML/JSON   otros   federación'
totalCola=0
totalArchivo=0
for d in "$RAIZ"/descargas-*/; do
  [ -d "$d" ] || continue
  fed=$(basename "$d"); fed=${fed#descargas-}
  case "$fed" in prueba*|*-sondeo) continue ;; esac
  local_dir="$d/recolector-local"
  [ -d "$local_dir" ] || continue

  cola=$(du -sm "$local_dir"/cola-v2.sqlite* 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
  # El archivo son las carpetas de temporada, que cuelgan de recolector-local y NO son la cola ni el perfil.
  archivo=$(du -sm "$local_dir"/t[0-9]* 2>/dev/null | awk '{ s += $1 } END { print s + 0 }')
  todo=$(du -sm "$local_dir" 2>/dev/null | awk '{ print $1 + 0 }')
  otros=$(( todo - cola - archivo ))

  totalCola=$(( totalCola + cola ))
  totalArchivo=$(( totalArchivo + archivo ))
  printf '  %5s %12s %18s %8s   %s\n' "$todo" "$cola" "$archivo" "$otros" "$fed"
done

echo
printf '  TOTAL colas:   %s MB (%.1f GB)\n' "$totalCola" "$(awk -v m="$totalCola" 'BEGIN { print m / 1024 }')"
printf '  TOTAL archivo: %s MB (%.1f GB)\n' "$totalArchivo" "$(awk -v m="$totalArchivo" 'BEGIN { print m / 1024 }')"
echo

echo '════ ¿CABE EN EL SSD? ════'
libreSSD=$(df -m / | awk 'NR==2 { print $4 }')
echo "  libre en / (SSD): $(( libreSSD / 1024 )) GB"
echo "  las colas solas:  $(( totalCola / 1024 )) GB  → $([ "$totalCola" -lt "$libreSSD" ] && echo 'CABEN' || echo 'NO CABEN')"
echo "  todo el archivo:  $(( totalArchivo / 1024 )) GB → $([ "$totalArchivo" -lt "$libreSSD" ] && echo 'CABE' || echo 'NO CABE')"
