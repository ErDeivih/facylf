#!/bin/bash
# Temporadas VACÍAS (0 competiciones) en las 16 federaciones del servidor.
#
# Una temporada con 0 competiciones es invisible en cualquier resumen: no tiene trabajo, así que no pide nada,
# así que parece al día. Es la firma de Melilla 11-15 y de la Cataluña que sí tenía historial.
#
# SÓLO LEE.
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
for f in $FEDS; do
  docker exec "facylf-${f}-1" node /srv/ssd/facylf/scripts/diagnostica-temporadas-vacias.mjs \
    "/app/descargas-${f}/recolector-local/cola-v2.sqlite" "$f" 2>/dev/null
done
