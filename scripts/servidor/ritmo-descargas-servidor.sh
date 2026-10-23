#!/bin/bash
# Ritmo de descargas de las últimas 24 horas en el SERVIDOR.
#
# El host no tiene sqlite3 ni node, así que se lee con un contenedor node:22-alpine que ya está descargado,
# montando las colas en sólo lectura. Cada federación tiene la suya: la mayoría en el SSD (enlazadas desde su
# ruta de siempre) y unas pocas todavía en /srv/data.
echo "=== RUTAS DE LAS COLAS POR FEDERACIÓN ==="
COLAS=""
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja; do
  for base in /srv/ssd/facylf /srv/data/facylf/descargas; do
    caso=$(ls -d "$base/$fed/cola-v2.sqlite" 2>/dev/null | head -1)
    if [ -z "$caso" ]; then
      caso=$(ls -d "/srv/data/facylf/descargas-$fed/recolector-local/cola-v2.sqlite" 2>/dev/null | head -1)
    fi
    if [ -n "$caso" ]; then
      real=$(readlink -f "$caso")
      COLAS="$COLAS $fed=$real"
      break
    fi
  done
done
echo "$COLAS" | tr ' ' '\n' | grep '=' | sed 's/^/  /'

echo
echo "=== MIDIENDO (contenedor node, sólo lectura) ==="
ARGS=""
for par in $COLAS; do
  ruta="${par#*=}"
  ARGS="$ARGS $ruta"
done
# El guion va montado dentro para no copiarlo: se sube antes a scripts/ritmo-descargas.mjs
#
# Los volúmenes se montan EN LAS MISMAS RUTAS ABSOLUTAS que en el host: así las rutas que se pasan al guion
# valen tal cual dentro del contenedor y no hay que traducirlas (el primer intento las tradujo mal y las
# dieciséis colas salieron como «no existe»).
# Los argumentos que se pasen a este guion van tal cual al de node: así `ritmo-descargas-servidor.sh --horas 1`
# mide la última hora, que es lo que hace falta justo después de tocar un reparto (con la ventana fija de 24 h el
# cambio se mide mezclado con todo lo anterior y parece que no ha servido de nada).
docker run --rm \
  -v /srv/ssd/facylf:/srv/ssd/facylf:ro \
  -v /srv/data/facylf:/srv/data/facylf:ro \
  node:22-alpine node /srv/data/facylf/scripts/ritmo-descargas.mjs $ARGS "$@" 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings
