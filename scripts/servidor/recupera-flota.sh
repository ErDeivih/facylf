#!/bin/bash
# RECUPERACIÓN: el daemon de Docker quedó con cientos de procesos atascados (containerd con objetos de tarea
# obsoletos) tras la migración de colas: `r` = 206 en vmstat, load 163, y `docker ps -q` sin contenedores.
#
# Este es el mismo camino que ya se siguió el 24/09 en una situación parecida: reiniciar el daemon (que limpia
# los shims atascados) y volver a levantar la flota con los tres ficheros de compose, porque `unless-stopped`
# NO la restaura sola.
echo "=== ANTES ==="
uptime
echo -n "procesos totales: "; ps -e --no-headers 2>/dev/null | wc -l
echo -n "contenedores: "; timeout 60 docker ps -q 2>/dev/null | wc -l
echo
echo "=== REINICIAR EL DAEMON ==="
sudo systemctl restart docker 2>&1 | tail -3
sleep 20
systemctl is-active docker
echo -n "procesos totales tras el reinicio: "; ps -e --no-headers 2>/dev/null | wc -l
uptime
echo
echo "=== LEVANTAR LA FLOTA (recolectores + postgres + web) ==="
cd /srv/data/facylf || exit 1
timeout 900 docker compose -p facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml up -d 2>&1 | tail -6
echo
echo "=== EL IMPORTADOR ==="
timeout 300 docker compose -p facylf --env-file docker/.env -f docker/importador.yml up -d 2>&1 | tail -3
echo
echo "=== EL MONITOR ==="
timeout 300 docker compose -p docker --env-file docker/.env -f docker/monitor.yml up -d 2>&1 | tail -3
echo
echo "=== RESULTADO ==="
sleep 15
uptime
timeout 120 docker ps --format '{{.Names}} {{.Status}}' 2>&1 | sort | head -40
