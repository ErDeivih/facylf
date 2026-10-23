#!/bin/bash
# Reprocesa SIN RED, temporada a temporada y en serie, todo lo descargado de Euskadi con el parser actual
# (euskera: campo, ciudad, tipo de gol; rutas de la otra máquina). Se lanza DESACOPLADO de la sesión (docker exec -d),
# porque un `&` dentro de un `docker exec` por ssh moría al cerrarse la sesión (18/10/2026).
#   ssh servidor "bash /srv/data/facylf/scripts/servidor/reprocesa-euskadi.sh"
#   ssh servidor "bash /srv/data/facylf/scripts/servidor/reprocesa-euskadi.sh --estado"
set -u
C=facylf-euskadi-1
LOG=/app/descargas-euskadi/recolector-local/reprocesado-1810.log
if [ "${1:-}" = "--estado" ]; then
  docker exec "$C" sh -c "ps -eo etime,args | grep 'reprocesar' | grep -v grep; tail -4 $LOG"
  exit 0
fi
if docker exec "$C" sh -c "ps -eo args | grep -v grep | grep -q 'reprocesar --perfil perfiles/euskadi.json'"; then
  echo "Ya hay un reprocesado de Euskadi en marcha; no se lanza otro."; exit 0
fi
docker exec -d "$C" sh -c "for n in 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22; do echo \"== temporada \$n \$(date)\"; nice -n 19 node scripts/recolector-local.mjs reprocesar --perfil perfiles/euskadi.json --temporada \$n; done >> $LOG 2>&1; echo \"== FIN \$(date)\" >> $LOG"
sleep 5
docker exec "$C" sh -c "ps -eo etime,args | grep 'reprocesar' | grep -v grep; tail -2 $LOG"
