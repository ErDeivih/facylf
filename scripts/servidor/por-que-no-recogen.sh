#!/bin/bash
# ¿Por qué Baleares, Canarias y Melilla no recogen? ¿Están rotas o sólo esperando?
#
# La diferencia importa y es fácil de confundir: un trabajo aplazado a una fecha CERCANA está esperando su turno
# (funciona bien); uno aplazado a 2099 está aparcado para siempre (roto). Y un contenedor sin proceso puede ser
# que no tenga trabajo —no pasa nada— o que se haya caído.
#
# SÓLO LEE.
set -u
for f in baleares canarias melilla; do
  c="facylf-${f}-1"
  cola="/app/descargas-${f}/recolector-local/cola-v2.sqlite"
  log="/app/descargas-${f}/recolector-local/worker-programado.log"
  echo "════════ ${f} ════════"
  echo "  proceso: $(docker exec "$c" sh -c 'ps aux | grep -c "[r]ecolector-local"' 2>/dev/null)  ·  contenedor: $(docker inspect -f '{{.State.Status}} desde {{.State.StartedAt}}' "$c" 2>/dev/null | cut -c1-40)"
  echo "  temporadas asignadas: $(docker exec "$c" sh -c "grep -v '^ *#' /app/descargas-${f}/recolector-local/temporadas-asignadas.txt 2>/dev/null | tr '\n' ' '" 2>/dev/null)"
  echo "  últimas 3 líneas de su registro:"
  docker exec "$c" tail -3 "$log" 2>/dev/null | cut -c1-120 | sed 's/^/    /'
  docker exec "$c" node /srv/ssd/facylf/scripts/diagnostica-aplazados.mjs "$cola" "$f" 2>/dev/null | grep -A5 'POR FECHA' | sed 's/^/  /'
  echo
done
