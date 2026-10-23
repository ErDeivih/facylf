#!/bin/bash
# PENDIENTE 3: la flota pasó de 4-6 GB a 12 GB de un tope de 14. ¿Qué lo ha subido?
# PENDIENTE 1: ¿cómo va Valencia en el servidor, que también tiene su parte?
echo "=== MEMORIA DEL SISTEMA ==="
free -m | head -3
echo
echo "=== TOP DE CONTENEDORES POR MEMORIA ==="
timeout 150 docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}' 2>/dev/null | sort -t'|' -k3 -nr | head -12 | awk -F'|' '{printf "  %-28s %-22s %s\n", $1, $2, $4}'
echo
echo "=== CACHÉ SQLITE DECLARADA (memoria por recolector) ==="
timeout 25 docker exec facylf-murcia-1 printenv FACYLF_CACHE_MB FACYLF_MEMORIA_GB FACYLF_SINCRONO 2>&1 | sed 's/^/  /'
echo
echo "=== REBANADA DE MEMORIA (el tope del proyecto) ==="
cat /sys/fs/cgroup/facylf.slice/memory.current 2>/dev/null | awk '{printf "  actual: %.2f GB\n", $1/1073741824}'
cat /sys/fs/cgroup/facylf.slice/memory.peak 2>/dev/null | awk '{printf "  pico:   %.2f GB\n", $1/1073741824}'
cat /sys/fs/cgroup/facylf.slice/memory.max 2>/dev/null | awk '{printf "  tope:   %.2f GB\n", $1/1073741824}'
echo
echo "=== PROCESOS CHROME (cada uno cuesta ~500 MB) ==="
echo -n "  navegadores (procesos chrome): "; pgrep -c chrome 2>/dev/null || echo 0
echo -n "  recolectores con navegador abierto (fichas de plaza): "
timeout 25 docker exec facylf-murcia-1 sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null
echo
echo "=== ÚLTIMO AVISO DEL MONITOR ==="
docker logs --tail 80 facylf-monitor 2>&1 | grep -iE 'memoria|aviso' | tail -3 | cut -c1-160
