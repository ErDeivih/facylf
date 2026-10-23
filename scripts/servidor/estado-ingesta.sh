#!/bin/bash
# Estado de la ingesta en el servidor: contenedores, errores recientes y últimas líneas de cada uno.
# Se ejecuta por ssh (scp + bash) para no pelearse con las comillas de PowerShell.
echo "=== FECHA ==="
date
echo
echo "=== CONTENEDORES EN MARCHA ==="
docker ps --format '{{.Names}} {{.Status}}' 2>&1 | sort
echo
echo "=== CONTENEDORES PARADOS ==="
docker ps -a --filter status=exited --filter status=created --filter status=dead --format '{{.Names}} {{.Status}}' 2>&1 | sort
echo
echo "=== ERRORES EN LOS ULTIMOS 30 MINUTOS ==="
for c in $(docker ps --format '{{.Names}}'); do
  n=$(docker logs --since 30m "$c" 2>&1 | grep -ciE 'error|excepcion|excepción|failed|fallo|traceback' 2>/dev/null || echo 0)
  if [ "$n" != "0" ]; then echo "$c: $n linea(s)"; fi
done
echo "(los que no salen no han escrito ningún error)"
echo
echo "=== ULTIMAS LINEAS DE CADA CONTENEDOR ==="
for c in $(docker ps --format '{{.Names}}'); do
  echo "--- $c"
  docker logs --tail 2 "$c" 2>&1 | tail -2
done
