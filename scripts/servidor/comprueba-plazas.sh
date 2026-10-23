#!/bin/bash
# ¿Comparten los contenedores el directorio de fichas de plaza? Si no, el reparto de plazas no existe:
# cada federación vería 0 ocupadas y abriría su navegador, que es exactamente lo que mide la carga.
echo "=== FICHAS DE PLAZA Y NAVEGADORES POR CONTENEDOR ==="
printf '%-28s %7s %8s %s\n' contenedor fichas chromes "montajes de estado"
for c in $(docker ps --format '{{.Names}}' | grep -E '^facylf-.*-1$|^facylf-monitor$' | sort); do
  fichas=$(docker exec "$c" sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null)
  chromes=$(docker exec "$c" sh -c 'pgrep -c chrome 2>/dev/null || true' 2>/dev/null)
  monta=$(docker inspect -f '{{range .Mounts}}{{.Destination}} {{end}}' "$c" 2>/dev/null | tr ' ' '\n' | grep -c 'estado-workers')
  printf '%-28s %7s %8s %s\n' "$c" "${fichas:-?}" "${chromes:-0}" "$monta"
done
echo
echo "=== ¿QUE MONTA EL CONTENEDOR DE MURCIA? (comparacion) ==="
docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}
{{end}}' facylf-murcia-1 2>/dev/null | head -8
echo
echo "=== FICHAS VIVAS EN EL HOST (si se compartieran, estarian aqui) ==="
ls -la /srv/data/facylf/.estado-workers/slots-chrome 2>/dev/null | head -8
echo "(si no existe, el estado de plazas vive dentro de cada contenedor)"
echo
echo "=== NAVEGADORES TOTALES EN EL HOST ==="
pgrep -c chrome 2>/dev/null || echo 0
