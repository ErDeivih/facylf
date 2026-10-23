#!/bin/bash
# Diagnóstico del load alto tras la recuperación: ¿CPU o espera de E/S? ¿Cuántos procesos y de qué tipo?
echo "=== ESTADOS DE PROCESO (R=ejecutando, D=espera E/S, S=dormido, Z=zombi) ==="
ps -eo stat --no-headers 2>/dev/null | cut -c1 | sort | uniq -c | sort -rn | head -6
echo
echo "=== COLA DE EJECUCION Y E/S (r=ejecutando, b=bloqueados, wa=iowait) ==="
vmstat 1 3 2>/dev/null | tail -3
echo
echo "=== TOP 8 POR CPU ==="
top -bn2 -d 2 2>/dev/null | awk '/^top -/{n++} n==2' | sed -n '7,16p' | cut -c1-105
echo
echo "=== CUANTOS NAVEGADORES Y CUANTOS NODE ==="
echo -n "procesos chrome: "; pgrep -c chrome 2>/dev/null || echo 0
echo -n "procesos node:   "; pgrep -c node 2>/dev/null || echo 0
echo -n "procesos containerd-shim: "; pgrep -c containerd-shim 2>/dev/null || echo 0
echo
echo "=== CONTENEDORES ARRIBA (con paciencia) ==="
timeout 240 docker ps --format '{{.Names}}' 2>/dev/null | wc -l
