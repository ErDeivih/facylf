#!/bin/bash
# Progreso de la migración al SSD y estado de los recolectores, sin `docker ps -a` (el daemon va saturado).
echo "=== COLAS QUE SIGUEN EN EL HDD (fichero normal) ==="
for f in /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite; do
  [ -e "$f" ] || continue
  fed=$(printf '%s' "$f" | sed 's|/srv/data/facylf/descargas-||; s|/recolector-local.*||')
  if [ -L "$f" ]; then
    printf '  %-22s enlace -> SSD\n' "$fed"
  else
    printf '  %-22s FICHERO en el HDD (%s MB)\n' "$fed" "$(( $(stat -c %s "$f") / 1048576 ))"
  fi
done
echo
echo "=== ESTADO DE CADA RECOLECTOR ==="
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia; do
  s=$(docker inspect -f '{{.State.Status}}:{{.State.ExitCode}}' "facylf-$fed-1" 2>/dev/null)
  printf '  %-22s %s\n' "$fed" "${s:-sin contenedor}"
done
