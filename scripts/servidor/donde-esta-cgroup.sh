#!/usr/bin/env bash
# ¿Dónde vive el `cpu.stat` de un contenedor en ESTE servidor? Sirve para medir consumo por contenedor sin
# entrar en él. Imprime la ruta válida y de qué contenedor es, probando las disposiciones conocidas.
set -uo pipefail
c=${1:-facylf-cataluna-1}
id=$(docker inspect -f '{{.Id}}' "$c")
echo "contenedor: $c"
echo "id: $id"
echo
echo "── candidatos ──"
for base in \
  "/sys/fs/cgroup/system.slice/docker-$id.scope" \
  "/sys/fs/cgroup/docker/$id" \
  "/sys/fs/cgroup/docker-$id.scope" \
  "/sys/fs/cgroup/cpu/docker/$id" \
  "/sys/fs/cgroup/cpuacct/docker/$id"
do
  if [ -e "$base" ]; then
    echo "  EXISTE: $base"
    ls "$base" 2>/dev/null | head -5 | sed 's/^/    /'
  fi
done
echo
echo "── qué hay en /sys/fs/cgroup (primer nivel) ──"
ls /sys/fs/cgroup | head -15
echo
echo "── búsqueda del id en el árbol (hasta 4 niveles) ──"
find /sys/fs/cgroup -maxdepth 4 -name "*${id:0:12}*" 2>/dev/null | head -5
echo
echo "── versión de cgroups ──"
stat -fc %T /sys/fs/cgroup
