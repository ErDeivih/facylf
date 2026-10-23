#!/bin/bash
# Ritmo y fallos de la ingesta del servidor.
echo "=== IMPORTADOR: ultimas 40 lineas ==="
docker logs --tail 40 facylf-importador 2>&1 | tail -40
echo
echo "=== IMPORTADOR: lineas con fallo/error de las ultimas 3 horas ==="
docker logs --since 3h facylf-importador 2>&1 | grep -iE 'fallo|error|apartad' | tail -25
echo
echo "=== FICHEROS DE APOYO DEL PROYECTO EN EL SERVIDOR ==="
ls /srv/data/facylf/scripts/servidor/ 2>&1 | head -40
echo
echo "=== CARGA Y MEMORIA ==="
uptime
free -g | head -3
echo
echo "=== ESPACIO ==="
df -h /srv /var/lib/docker 2>&1 | head -5
