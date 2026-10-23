#!/bin/bash
# Verificación de la medición: la cuota de CPU de un contenedor tiene que notarse. Si un contenedor con cuota
# de 1 núcleo mide 697 %, la medición está mal, no el contenedor.
echo "=== VIA 1: cgroup del contenedor visto desde dentro (la que usé) ==="
echo -n "facylf-monitor dentro: "; docker exec facylf-monitor sh -c 'cat /sys/fs/cgroup/cpu.stat | head -2' 2>&1 | tr '\n' ' '
echo
echo -n "cpu.max del monitor:   "; docker exec facylf-monitor sh -c 'cat /sys/fs/cgroup/cpu.max' 2>&1
echo -n "cpu.max de cantabria:  "; docker exec facylf-cantabria-1 sh -c 'cat /sys/fs/cgroup/cpu.max' 2>&1
echo
echo "=== VIA 2: cgroup del host por identificador de contenedor ==="
for c in facylf-monitor facylf-cantabria-1 facylf-aragon-1; do
  id=$(docker inspect -f '{{.Id}}' "$c" 2>/dev/null | cut -c1-12)
  ruta="/sys/fs/cgroup/system.slice/docker-$id.scope/cpu.stat"
  echo -n "$c ($id): "
  if [ -r "$ruta" ]; then echo "leible"; else echo "NO leible -> $ruta"; fi
done
echo
echo "=== VIA 3: dos muestras de cpu.stat por contenedor, 20 s ==="
mide() {
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    id=$(docker inspect -f '{{.Id}}' "$c" 2>/dev/null | cut -c1-12)
    ruta="/sys/fs/cgroup/system.slice/docker-$id.scope/cpu.stat"
    v=$(awk '/usage_usec/ {print $2}' "$ruta" 2>/dev/null)
    [ -z "$v" ] && v=$(docker exec "$c" sh -c 'awk "/usage_usec/ {print \$2}" /sys/fs/cgroup/cpu.stat' 2>/dev/null)
    echo "$c ${v:-0}"
  done
}
mide > /tmp/v1.txt; sleep 20; mide > /tmp/v2.txt
join /tmp/v1.txt /tmp/v2.txt | awk '{ printf "%-28s %7.2f %%\n", $1, ($3-$2)/1000000/20*100 }' | sort -k2 -nr | head -14
echo
echo -n "TOTAL flota (nucleos): "
join /tmp/v1.txt /tmp/v2.txt | awk '{ s+=($3-$2)/1000000 } END { printf "%.2f de %d\n", s/20, '"$(nproc)"' }'
echo
echo "=== VIA 4: top instantaneo del host (dos iteraciones, la segunda es la buena) ==="
top -bn2 -d 1 2>/dev/null | awk '/^top -/{n++} n==2' | head -18 | cut -c1-120
