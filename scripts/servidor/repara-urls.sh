#!/bin/sh
# Repara en el servidor los trabajos con la URL del portal de OTRA federación (bug de la pasada del fin de semana,
# 21/10/2026). Pasa el guion por la entrada estándar al contenedor monitor, que ve todas las colas.
#   sh /srv/data/facylf/scripts/servidor/repara-urls.sh            · sólo cuenta
#   sh /srv/data/facylf/scripts/servidor/repara-urls.sh --aplicar  · lo escribe
# Andalucía NO va: en el servidor es una copia vieja (la recoge el PC).
AQUI="$(cd "$(dirname "$0")/.." && pwd)"
FEDS="galicia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura melilla murcia navarra rioja"
docker exec -i -e FACYLF_RAIZ=/app facylf-monitor sh -c 'cat > /tmp/ru.mjs && nice -n 19 node --no-warnings /tmp/ru.mjs "$@"; rm -f /tmp/ru.mjs' sh "$@" $FEDS < "$AQUI/claude/repara-urls-otra-federacion.mjs"
