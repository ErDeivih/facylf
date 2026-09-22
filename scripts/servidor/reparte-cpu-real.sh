#!/usr/bin/env bash
# ── ¿DE QUIÉN ES EL PROCESADOR QUE SE ESTÁ USANDO? ──────────────────────────────────────────────────────
#
# Sumar el consumo de los contenedores y compararlo con el del sistema deja un hueco que hay que explicar: en un
# servidor de 4 núcleos, ver «contenedores 1,1 núcleos» y «sistema al 98 %» significa que ~2,8 núcleos se están
# gastando en algo que no es ninguno de los contenedores que miramos. Esto lo resuelve enseñando, para los
# procesos que más consumen, A QUÉ CGROUP pertenecen: así se ve si es un contenedor (y cuál), un `docker run`
# suelto, o un proceso del propio sistema.
#
# Uso: bash scripts/servidor/reparte-cpu-real.sh [segundos] [cuántos]
set -uo pipefail

PAUSA=${1:-15}
CUANTOS=${2:-15}

# Segunda muestra de `top`: la primera trae la media desde que arrancó cada proceso, que no dice nada de ahora.
lineas=$(top -bn2 -d "$PAUSA" 2>/dev/null | awk '/^top -/{n++} n==2' | grep -E '^ *[0-9]+' | head -"$CUANTOS")

echo "── procesos que más consumen ahora, y de quién son ──"
printf '  %-8s %-6s %-9s %s\n' pid cpu% rss_mb cgroup
while read -r pid usuario pri ni virt res est cpu mem tiempo resto; do
  [ -z "${pid:-}" ] && continue
  cgroup=$(awk -F: '{ print $3 }' "/proc/$pid/cgroup" 2>/dev/null | head -1)
  # Del cgroup se saca el nombre del contenedor (docker-<id>.scope) y en qué rebanada vive.
  corto=$(printf '%s' "$cgroup" | sed 's|/sys/fs/cgroup||; s|/docker-\([0-9a-f]\{12\}\)[0-9a-f]*\.scope|/docker-\1…|')
  printf '  %-8s %-6s %-9s %s\n' "$pid" "$cpu" "$(awk -v r="$res" 'BEGIN { printf "%.0f", r / 1024 }')" "$corto"
done <<< "$lineas"

echo
echo "── suma por rebanada (de todos los procesos del sistema, vía cgroup) ──"
# Se recorre cada cgroup de Docker y se lee su `cpu.stat`: es el consumo real acumulado del contenedor.
declare -A acumulado
total=0
for carpeta in /sys/fs/cgroup/*/docker-*.scope /sys/fs/cgroup/docker/*; do
  [ -d "$carpeta" ] || continue
  uso=$(awk '/^usage_usec/ { print $2 }' "$carpeta/cpu.stat" 2>/dev/null)
  [ -z "$uso" ] && continue
  rebanada=$(basename "$(dirname "$carpeta")")
  acumulado[$rebanada]=$(( ${acumulado[$rebanada]:-0} + uso ))
done
for rebanada in "${!acumulado[@]}"; do
  printf '  %-24s %8.1f s de CPU acumulada\n' "$rebanada" "$(awk -v u="${acumulado[$rebanada]}" 'BEGIN { print u / 1000000 }')"
done | sort -k2 -rn | head -10

echo
echo "  (para el consumo POR SEGUNDO, usa `mide-cpu.sh`; esto es el acumulado desde que arrancó cada contenedor)"
