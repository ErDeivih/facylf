#!/bin/bash
# ¿Qué contenedores ven el SSD? Los que migraron su cola con un enlace necesitan /srv/ssd/facylf montado
# dentro, o el enlace apunta a la nada y el recolector no arranca (pasó con Navarra: exit 128).
echo "=== MONTAJE DEL SSD POR CONTENEDOR ==="
printf '%-30s %-10s %s\n' contenedor ssd_montado estado
for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null | grep '^facylf-.*-1$' | sort); do
  ssd=$(docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' "$c" 2>/dev/null | tr ' ' '\n' | grep -c '^/srv/ssd/facylf$')
  estado=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)
  marca="si"
  [ "$ssd" = "0" ] && marca="NO"
  printf '%-30s %-10s %s\n' "$c" "$marca" "$estado"
done
echo
echo "=== ¿LA COLA DE CADA UNO RESUELVE DENTRO DEL CONTENEDOR? ==="
for c in $(docker ps --format '{{.Names}}' 2>/dev/null | grep '^facylf-.*-1$' | sort); do
  r=$(docker exec "$c" sh -c 'ls -l /app/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | head -1' 2>/dev/null)
  printf '%-30s %s\n' "$c" "${r:-SIN COLA VISIBLE}"
done
