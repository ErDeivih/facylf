#!/usr/bin/env bash
# Deja los TRES recolectores de Castilla y Leon en marcha tras un reinicio.
# `restart: unless-stopped` ya los levanta si estaban corriendo al apagarse; esto es la red de seguridad para
# cuando la guardia de energia o un `docker stop` los deja parados. El 17/11/2026 solo volvio uno de los tres.
set -u
for c in facylf-federacion-1 facylf-federacion2-1 facylf-federacion3-1; do
  state=$(docker inspect -f "{{.State.Running}}" "$c" 2>/dev/null || echo "no-existe")
  if [ "$state" != "true" ]; then
    docker start "$c" >/dev/null 2>&1 && echo "$(date "+%F %T") arrancado $c" || echo "$(date "+%F %T") no se pudo arrancar $c"
  fi
done
exit 0
