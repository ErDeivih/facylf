#!/bin/bash
# INTERVENCIÓN LIMPIA: el daemon quedó con objetos de tarea obsoletos de containerd (42 shims, load 180 con 4
# núcleos, `docker inspect` sin responder). Reiniciar sólo `docker` ya se probó y no bastó: queda containerd con
# los restos. Aquí se paran LOS DOS, se limpian los shims residuales y se levanta la flota ESCALONADA, en grupos
# de cinco con pausas, para no repetir el pico de 19 navegadores arrancando a la vez.
#
# El canónico vive en un volumen: parar Postgres no pierde datos. Un lote del importador a medias queda sin
# terminar y se reintenta (el sistema valida lotes e es idempotente).
cd /srv/data/facylf || exit 1
FICH="--env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml"

echo "=== A. PARAR DOCKER Y CONTAINERD ==="
uptime
sudo systemctl stop docker docker.socket 2>&1 | tail -2
sudo systemctl stop containerd 2>&1 | tail -2
sleep 10
echo -n "shims residuales: "; pgrep -c containerd-shim 2>/dev/null || echo 0
pkill -f containerd-shim 2>/dev/null
pkill -f docker-proxy 2>/dev/null
sleep 5
echo -n "shims tras limpiar: "; pgrep -c containerd-shim 2>/dev/null || echo 0
echo -n "procesos totales: "; ps -e --no-headers 2>/dev/null | wc -l

echo
echo "=== B. ARRANCAR EL MOTOR LIMPIO ==="
sudo systemctl start containerd docker 2>&1 | tail -2
sleep 25
echo -n "containerd: "; systemctl is-active containerd
echo -n "docker:     "; systemctl is-active docker
echo -n "procesos:   "; ps -e --no-headers 2>/dev/null | wc -l
uptime

echo
echo "=== C. BASE Y WEB PRIMERO ==="
timeout 600 docker compose -p facylf $FICH up -d postgres web 2>&1 | tail -4
sleep 30
uptime

echo
echo "=== D. RECOLECTORES POR GRUPOS DE CINCO, CON PAUSAS ==="
for grupo in "andalucia aragon asturias baleares canarias" "cantabria castilla-la-mancha ceuta euskadi extremadura" "federacion galicia melilla murcia navarra" "rioja"; do
  echo "--- grupo: $grupo"
  timeout 600 docker compose -p facylf $FICH up -d $grupo 2>&1 | grep -E 'Started|Created|Error' | tail -6
  sleep 40
  uptime
done

echo
echo "=== E. IMPORTADOR Y MONITOR ==="
timeout 300 docker compose -p facylf --env-file docker/.env -f docker/importador.yml up -d 2>&1 | tail -2
timeout 300 docker compose -p docker --env-file docker/.env -f docker/monitor.yml up -d 2>&1 | tail -2

echo
echo "=== F. RESULTADO ==="
sleep 20
uptime
timeout 180 docker ps --format '{{.Names}}|{{.Status}}' 2>&1 | sort | awk -F'|' '{printf "  %-30s %s\n", $1, $2}'
