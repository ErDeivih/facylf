#!/usr/bin/env bash
# Quién consume el procesador: el sistema entero en un intervalo, y los procesos de dentro de los contenedores.
# Uso: bash /tmp/quien-consume.sh [segundos]
set -uo pipefail
SEGUNDOS=${1:-30}

echo "── uso de CPU del sistema en ${SEGUNDOS} s (media) ──"
a=$(awk '/^cpu / { s = 0; for (i = 2; i <= 8; i++) s += $i; print s, $5 }' /proc/stat)
sleep "$SEGUNDOS"
b=$(awk '/^cpu / { s = 0; for (i = 2; i <= 8; i++) s += $i; print s, $5 }' /proc/stat)
awk -v a="$a" -v b="$b" -v t="$SEGUNDOS" -v n="$(nproc)" 'BEGIN {
  split(a, x, " "); split(b, y, " ");
  total = y[1] - x[1]; idle = y[2] - x[2];
  printf "  ocupado: %.0f %% de %s núcleos (%.2f núcleos) · tiempo libre: %.0f %%\n", 100 * (total - idle) / total, n, (total - idle) / 100 / t, 100 * idle / total
}'

echo
echo "── top 12 procesos por CPU (segunda muestra de top: es la instantánea, no la media desde que arrancó) ──"
top -bn2 -d 3 2>/dev/null | awk '/^top -/{n++} n==2' | grep -E '^ *[0-9]+' | head -12 | sed 's/^/  /'

echo
echo "── disposición de cgroups de Docker ──"
id_unico=$(docker ps -q | head -1)
if [ -n "$id_unico" ]; then
  for base in "/sys/fs/cgroup/system.slice/docker-$id_unico.scope" "/sys/fs/cgroup/docker/$id_unico"; do
    if [ -f "$base/cpu.stat" ]; then
      echo "  ruta válida: $base/cpu.stat"
      grep -E '^(usage_usec|nr_throttled|throttled_usec)' "$base/cpu.stat" | sed 's/^/    /'
      break
    fi
  done
fi

echo
echo "── ¿hay contenedores limitados por su cuota de CPU? (nr_throttled > 0) ──"
for c in $(docker ps --format '{{.Names}}' | sort); do
  id=$(docker inspect -f '{{.Id}}' "$c" 2>/dev/null)
  f="/sys/fs/cgroup/system.slice/docker-$id.scope/cpu.stat"
  [ -f "$f" ] || f="/sys/fs/cgroup/docker/$id/cpu.stat"
  [ -f "$f" ] || continue
  awk -v c="$c" '/^nr_throttled/ { if ($2 > 0) printf "  %-26s paradas por cuota: %s\n", c, $2 }' "$f"
done
