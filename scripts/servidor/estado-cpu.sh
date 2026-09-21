#!/usr/bin/env bash
# CPU real del servidor: cuánto suman los contenedores de facylf y cuánto queda libre.
set -uo pipefail

echo "── CPU por contenedor (de facylf y RadioPV) ──"
docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' | grep -E 'facylf|radiopv' | sort | sed 's/|/ · /g; s/^/  /'

echo
echo "── suma ──"
docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}' | grep facylf \
  | awk -F'|' '{gsub(/%/,"",$2); s+=$2} END {printf "  facylf usa %.0f %% de un núcleo = %.2f núcleos de %d\n", s, s/100, '"$(nproc)"'}'

echo
echo "── carga, hilos y memoria ──"
echo "  carga (1/5/15 min): $(awk '{print $1, $2, $3}' /proc/loadavg)"
echo "  hilos en el sistema: $(ps -eLf | wc -l)"
echo "  memoria: $(free -m | awk 'NR==2 {printf "%s MB usados de %s MB (%s MB disponibles)", $3, $2, $7}')"
