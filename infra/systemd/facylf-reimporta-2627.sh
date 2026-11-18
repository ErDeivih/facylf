#!/usr/bin/env bash
# Reimporta los grupos de 2026-27 para que el canonico recoja horarios y arbitros nuevos.
# El bucle lee la lista por el descriptor 3: `docker exec -i` consume la entrada estandar y, sin esto,
# el bucle se para tras el primer grupo (paso medido el 18/11/2026).
set -u
LOG=/var/log/facylf-reimporta-2627.log
while read -r g <&3; do
  [ -z "$g" ] && continue
  echo "=== $(date "+%F %T") grupo $g ===" >> "$LOG"
  timeout 300 docker exec -i facylf-importador /usr/local/bin/node \
    /app/packages/canonico/node_modules/tsx/dist/cli.mjs \
    /app/packages/canonico/src/cli.ts --federacion castilla-leon --temporada 2026-27 --grupo "$g" \
    >> "$LOG" 2>&1
  sleep 5
done 3< /tmp/grupos2627.txt
echo "=== $(date "+%F %T") fin ===" >> "$LOG"
