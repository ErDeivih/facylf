#!/bin/bash
# ── DESPLIEGUE COMPLETO DEL RECOLECTOR (carpeta `lib/` entera + el fichero) ──────────────────────────────
#
# El 06/10/2026 desplegué SÓLO `recolector-local.mjs` y dejé los 16 recolectores caídos: el fichero nuevo
# importa `./lib/temporadas-asignadas.mjs`, y las imágenes del servidor son del 23/09, cuando ese módulo no
# existía. Un fichero suelto de un repositorio que ha seguido avanzando deja el contenedor con una MEZCLA, y
# la mezcla se rompe por un `import`.
#
# Lo que hace bien: copia **toda la carpeta `lib/`** junto con el fichero, así que lo que se importa y lo que
# se ejecuta vienen del mismo sitio y de la misma fecha. `lib/` es autónoma (sólo módulos de Node, sin
# dependencias de npm), así que no hace falta tocar la imagen ni `npm install`.
#
# Y lo que aprendí a comprobar: **el error de un `import` NO sale por el registro del contenedor, sale por el
# fichero de registro del recolector**. Por eso la verificación de aquí abajo EJECUTA el recolector de verdad
# y lee su registro, en vez de conformarse con que el contenedor esté «Up».
#
# Uso:  bash despliega-completo.sh <carpeta-con-lib-y-el-fichero> [--aplicar]
set -u
ORIGEN="${1:?uso: despliega-completo.sh <carpeta> [--aplicar]}"
APLICAR=0
[ "${2:-}" = "--aplicar" ] && APLICAR=1
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

echo "origen: $ORIGEN"
ls "$ORIGEN/lib" | wc -l | sed 's/^/  modulos en lib: /'
echo

for f in $FEDS; do
  c="facylf-${f}-1"
  if [ "$APLICAR" = "1" ]; then
    # Copia de seguridad de lo que se va a pisar, DENTRO del contenedor.
    docker exec "$c" sh -c 'cp -r /app/scripts/lib /app/scripts/lib.previo 2>/dev/null; cp /app/scripts/recolector-local.mjs /app/scripts/recolector-local.mjs.previo 2>/dev/null'
    docker cp "$ORIGEN/lib/." "$c:/app/scripts/lib/" >/dev/null 2>&1
    docker cp "$ORIGEN/recolector-local.mjs" "$c:/app/scripts/recolector-local.mjs" >/dev/null 2>&1
    docker restart "$c" >/dev/null 2>&1
    echo "  ${f}: lib + fichero copiados, reiniciado"
  else
    echo "  ${f}: (mirar)"
  fi
done

if [ "$APLICAR" != "1" ]; then echo; echo "  (MIRAR: no se ha copiado nada. Repetir con --aplicar)"; exit 0; fi

echo
echo "════════ VERIFICACION: ejecutar el recolector de verdad y leer SU registro ════════"
for f in aragon asturias extremadura; do
  c="facylf-${f}-1"
  echo "--- ${f}"
  # Una sesión de un solo trabajo: si un `import` falta, aquí se ve, y en su registro, no en el del contenedor.
  timeout 120 docker exec "$c" node /app/scripts/recolector-local.mjs arrancar --max 1 2>&1 | tail -4 | cut -c1-135
done
