#!/bin/bash
# El `docker compose up -d navarra` quedó en bucle: 74 procesos y el load subiendo a 173. Se cortan.
#
# OJO con `pkill -f`: el patrón NO puede aparecer en la línea de comandos del propio pkill, o se mata a sí
# mismo y a la shell. Por eso esto va en un guion (su cmdline es «bash /tmp/...») y el patrón se pasa como
# variable, nunca como texto suelto en la orden.
PATRON="up -d navarra"
echo "=== ANTES ==="
pgrep -cf "$PATRON" 2>/dev/null || echo 0
uptime
echo
echo "=== MATANDO LOS PROCESOS DE COMPOSE DE NAVARRA ==="
pkill -f "$PATRON" 2>/dev/null
sleep 5
echo -n "quedan: "; pgrep -cf "$PATRON" 2>/dev/null || echo 0
echo
echo "=== ¿RESPONDE EL DAEMON? ==="
timeout 60 docker version --format '{{.Server.Version}}' 2>&1 | head -3
echo -n "contenedores arriba: "; timeout 90 docker ps -q 2>/dev/null | wc -l
echo
echo "=== SERVICIO DOCKER ==="
systemctl is-active docker 2>&1
systemctl show docker --property=NRestarts 2>/dev/null
echo
echo "=== CARGA Y COLA DE E/S ==="
uptime
vmstat 1 3 2>/dev/null | tail -3
