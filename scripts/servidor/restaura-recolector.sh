#!/bin/bash
# ── DESHACER EL DESPLIEGUE DEL RECOLECTOR (vuelta atrás) ─────────────────────────────────────────────────
#
# El 06/10/2026 desplegué el `recolector-local.mjs` del repositorio dentro de los 16 contenedores del servidor.
# El fichero nuevo importa `./lib/temporadas-asignadas.mjs`, y **las imágenes del servidor son del 23/09**, así
# que ese módulo NO existe dentro:
#
#   ERR_MODULE_NOT_FOUND: file:///app/scripts/lib/temporadas-asignadas.mjs
#   El worker termino con codigo 1; siguiente intento en 3600 s
#
# Dejó a los recolectores caídos y, además, aparcados una hora. La copia de seguridad que hice antes de
# sobrescribir es lo que los devuelve a la vida.
#
# Lección para la próxima vez, y por eso está escrita aquí: **desplegar un solo fichero de un repositorio que
# ha seguido avanzando deja el contenedor con una mezcla, y la mezcla se rompe por un `import`**. O se despliega
# el juego completo de ficheros que cambiaron, o no se despliega nada. Y la comprobación hay que hacerla en el
# REGISTRO DEL RECOLECTOR, no en el del contenedor: el error de un `import` no sale por la salida estándar.
#
# Uso:  bash restaura-recolector.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

for f in $FEDS; do
  c="facylf-${f}-1"
  if docker exec "$c" test -f /app/scripts/recolector-local.mjs.previo 2>/dev/null; then
    docker exec "$c" cp /app/scripts/recolector-local.mjs.previo /app/scripts/recolector-local.mjs 2>/dev/null \
      && docker restart "$c" >/dev/null 2>&1 \
      && echo "  ${f}: restaurado y reiniciado" \
      || echo "  ${f}: FALLO al restaurar"
  else
    echo "  ${f}: no hay copia de seguridad (no lo toqué o ya se restauró)"
  fi
done
