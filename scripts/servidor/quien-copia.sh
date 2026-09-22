#!/usr/bin/env bash
# ¿Quién está lanzando copias? Lista los procesos implicados con su padre y su hora de arranque.
set -uo pipefail
echo "── procesos con «copias» ──"
ps -eo pid,ppid,lstart,etime,args | grep -E 'copias|copia-cola' | grep -v grep | sed 's/^/  /'
echo
echo "── árbol de esos procesos ──"
for p in $(pgrep -f 'copias' 2>/dev/null); do
  echo "  pid $p → padre $(awk '{print $4}' /proc/$p/stat 2>/dev/null) · $(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null | cut -c1-120)"
done
echo
echo "── ¿hay algo en el cron? ──"
crontab -l 2>/dev/null | sed 's/^/  /' || echo "  (sin crontab del usuario)"
echo
echo "── contenedores de copia ──"
for id in $(docker ps -q); do
  cmd=$(docker inspect -f '{{join .Config.Cmd " "}}' "$id" 2>/dev/null)
  case "$cmd" in
    *copia-cola.mjs*) echo "  $id · $(docker inspect -f '{{.State.StartedAt}}' "$id")" ;;
  esac
done
