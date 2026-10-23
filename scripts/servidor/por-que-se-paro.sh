#!/bin/bash
# El servidor está ENCENDIDO (up desde las 11:24) pero sin contenedores: la flota se paró después de las 11:35.
# Aquí se mira POR QUÉ antes de levantar nada, y luego se levanta con el guion que ya usa los proyectos buenos.
echo "=== ESTADO ==="
uptime
echo -n "  contenedores en marcha (todos): "; docker ps -q 2>/dev/null | wc -l
echo -n "  contenedores facylf parados:    "; docker ps -a --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -c '^facylf'
echo
echo "=== LOS QUE HAY, CON SU ESTADO ==="
docker ps -a --format '{{.Names}}|{{.Status}}' 2>/dev/null | grep '^facylf' | sort | head -25 | awk -F'|' '{printf "  %-30s %s\n", $1, $2}'
echo
echo "=== EL MOTOR DE DOCKER ==="
systemctl is-active docker 2>&1
systemctl show docker --property=NRestarts 2>/dev/null
echo
echo "=== POR QUE SE PARARON: errores del sistema desde las 11:30 ==="
sudo journalctl -p err --since '2026-09-26 11:30' --no-pager 2>/dev/null | tail -12
echo
echo "=== AVISOS DE MEMORIA (OOM) ==="
sudo journalctl --since '2026-09-26 11:30' --no-pager 2>/dev/null | grep -iE 'oom|killed process|out of memory' | tail -8 || echo "  ninguno"
echo
echo "=== ULTIMAS LINEAS DEL MONITOR (¿vio algo antes de pararse?) ==="
docker logs --tail 12 facylf-monitor 2>&1 | tail -12
