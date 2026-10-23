#!/bin/bash
# Efecto del ajuste del monitor: carga, CPU por contenedor y peticiones. Dos muestras separadas.
echo "=== CARGA AHORA ==="
uptime
echo
echo "=== CPU POR CONTENEDOR (30 s) ==="
leer() {
  for c in $(docker ps --format '{{.Names}}' 2>/dev/null); do
    u=$(docker exec "$c" cat /sys/fs/cgroup/cpu.stat 2>/dev/null | awk '/usage_usec/ {print $2}')
    echo "$c ${u:-0}"
  done
}
leer > /tmp/c1.txt
sleep 30
leer > /tmp/c2.txt
join /tmp/c1.txt /tmp/c2.txt 2>/dev/null | awk '{ d=($3-$2)/1000000; printf "%-28s %7.2f\n", $1, d/30*100 }' | sort -k2 -nr | head -12
echo
echo -n "SUMA DE LA FLOTA (nucleos usados): "
join /tmp/c1.txt /tmp/c2.txt 2>/dev/null | awk '{ s+=($3-$2)/1000000 } END { printf "%.2f\n", s/30 }'
echo -n "nucleos disponibles: "; nproc
echo
echo "=== ESTADO DEL MONITOR ==="
docker ps --filter name=facylf-monitor --format '{{.Status}}'
grep -c . /srv/data/facylf/estado/historial.jsonl 2>/dev/null | sed 's/^/vueltas registradas: /'
echo
echo "=== ULTIMA FOTO DEL MONITOR (peticiones por federacion) ==="
if command -v jq >/dev/null 2>&1; then
  jq -r '.cuando, (.federaciones[] | "\(.federacion) \(.estado) pet=\(.peticionesVentana) fallos=\(.fallosVentana) disp=\(.disponibles)")' /srv/data/facylf/estado/facylf.json 2>/dev/null | head -22
else
  grep -E '"federacion"|"peticionesVentana"|"estado"' /srv/data/facylf/estado/facylf.json 2>/dev/null | head -10
fi
