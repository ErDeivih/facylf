#!/bin/bash
# Estado del servidor en una pantalla: carga, memoria del slice y contenedores.
set -u
echo "=== carga (4 nucleos) ==="
uptime
echo "=== memoria del sistema ==="
free -h | head -2 | sed 's/^/  /'
echo "=== memoria del slice FACyLF (limite 12 GiB) ==="
systemctl show facylf.slice -p MemoryMax -p MemoryCurrent 2>/dev/null | while IFS='=' read -r k v; do
  echo "  ${k} = $((v / 1073741824)) GiB"
done
echo "=== contenedores facylf ==="
docker ps --format '{{.Names}}' | grep -c '^facylf'
echo "=== los cinco nuevos (deben estar PARADOS) ==="
docker ps -a --format '{{.Names}} {{.Status}}' | grep -E 'facylf-(bizkaia|gipuzkoa|araba|laspalmas|tenerife)-1'
