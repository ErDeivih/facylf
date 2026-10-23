#!/bin/bash
# ¿A qué federación del servidor le falta historial por descubrir?
#
# El 08/10/2026 se descubrió que Cataluña sólo tenía 2 temporadas descubiertas cuando su configuración dice
# desdeAnio 2015. Esta es la comprobación sistemática: comparar las temporadas del catálogo de cada federación
# contra las que dice su configuración. El `desdeAnio` se lee de su propio recolector.<fed>.config.json, así que
# no se inventa ningún valor.
#
# SÓLO LEE.
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
S=/srv/ssd/facylf/scripts/diagnostica-catalogo.mjs

for f in $FEDS; do
  c="facylf-${f}-1"
  cola="/app/descargas-${f}/recolector-local/cola-v2.sqlite"
  # El desdeAnio de ESA federación, de su configuración. Si no está, se deja vacío y se informa igual.
  desde=$(docker exec "$c" sh -c "grep -o '\"desdeAnio\": *[0-9]*' /app/recolector.${f}.config.json 2>/dev/null | grep -o '[0-9]*'" 2>/dev/null | head -1)
  docker exec "$c" node "$S" "$cola" "$f" "${desde:-}" 2>/dev/null
done
