#!/bin/bash
# ¿Quién consume la CPU del servidor y cuánto cuesta cada recolector? Dos medidas, para no confundir
# «está saturado» con «está saturado por los recolectores».
echo "=== NUCLEOS Y CARGA ==="
nproc
uptime
echo
echo "=== TOP 12 PROCESOS POR CPU (instantanea de ps, % sobre un nucleo) ==="
ps -eo pcpu,pmem,rss,comm,args --sort=-pcpu 2>/dev/null | head -13 | cut -c1-140
echo
echo "=== NAVEGADORES Y RECOLECTORES ==="
echo -n "procesos chrome: "; pgrep -c -f chrome 2>/dev/null || echo 0
echo -n "procesos node:   "; pgrep -c node 2>/dev/null || echo 0
echo -n "contenedores:    "; docker ps -q 2>/dev/null | wc -l
echo
echo "=== CPU ACUMULADA POR CONTENEDOR (dos muestras separadas 30 s) ==="
leer() {
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    u=$(docker exec "$c" cat /sys/fs/cgroup/cpu.stat 2>/dev/null | awk '/usage_usec/ {print $2}')
    echo "$c ${u:-0}"
  done
}
leer > /tmp/cpu1.txt
sleep 30
leer > /tmp/cpu2.txt
join /tmp/cpu1.txt /tmp/cpu2.txt 2>/dev/null | awk '{ d=($3-$2)/1000000; printf "%-28s %6.2f %% de un nucleo\n", $1, d/30*100 }' | sort -k2 -nr | head -25
echo
echo "=== USO TOTAL DE LA FLOTA (suma de los 25 s) ==="
join /tmp/cpu1.txt /tmp/cpu2.txt 2>/dev/null | awk '{ s+=($3-$2)/1000000 } END { printf "%.2f nucleos de %d\n", s/30, '"$(nproc)"' }'
echo
echo "=== MEMORIA ==="
free -m | head -2
echo
echo "=== PRESUPUESTO DECLARADO DE LA FLOTA ==="
for c in facylf-murcia-1 facylf-importador; do
  echo -n "$c: "; docker exec "$c" printenv FACYLF_MEMORIA_GB 2>/dev/null || echo "(no declarado)"
done
