#!/bin/bash
# ¿Qué trabajo REAL le queda a cada federación del servidor?
#
# Responde a la desconfianza de David: una federación con años de registros por detrás no puede estar «sin
# trabajo». Si sale 0 pendiente y 0 sin trabajo, está al día de verdad; si sale 0 pendiente pero hay actas sin
# trabajo, lo que falta es ENCOLARLAS, no recolectar.
#
# El host no tiene node, así que cada cuenta se ejecuta DENTRO del contenedor de su federación, que sí lo
# tiene. El script vive en /srv/ssd/facylf, que está montado en todos los contenedores en la misma ruta.
#
# SÓLO LEE.
#
# Uso:  bash trabajo-por-federacion.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
SCRIPT=/srv/ssd/facylf/scripts/diagnostica-trabajo-cola.mjs

for f in $FEDS; do
  c="facylf-${f}-1"
  cola="/app/descargas-${f}/recolector-local/cola-v2.sqlite"
  docker exec "$c" node "$SCRIPT" "$cola" "$f" 2>/dev/null || echo "{\"federacion\":\"$f\",\"error\":\"no se pudo leer\"}"
done
