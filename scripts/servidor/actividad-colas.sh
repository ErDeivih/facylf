#!/bin/bash
# Actividad de las colas del servidor: quién escribe y cuándo. Distingue "recolectando" de "parado".
echo "=== COLAS EN EL SSD ==="
ls -ltL --time-style=+%d-%H:%M /srv/ssd/facylf/*/cola-v2.sqlite 2>/dev/null
echo
echo "=== HORA DEL SERVIDOR ==="
date +%d-%H:%M
echo
echo "=== QUIEN HA ESCRITO EN LOS ULTIMOS 5 MINUTOS ==="
find /srv/data/facylf /srv/ssd/facylf -maxdepth 4 -name 'cola-v2.sqlite*' -mmin -5 2>/dev/null | cut -d/ -f4 | sort -u
echo
echo "=== QUIEN HA ESCRITO EN LOS ULTIMOS 60 MINUTOS ==="
find /srv/data/facylf /srv/ssd/facylf -maxdepth 4 -name 'cola-v2.sqlite*' -mmin -60 2>/dev/null | cut -d/ -f4 | sort -u
echo
echo "=== CONTENEDORES POR CPU (muestra de 3 s) ==="
timeout 20 docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' 2>&1 | sort | head -25
