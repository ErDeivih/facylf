#!/bin/bash
# Comprueba que el despliegue del recolector no ha roto nada y si las federaciones paradas han arrancado.
# SÓLO LEE (el reintento de `federacion` va aparte, con --reintentar).
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

if [ "${1:-}" = "--reintentar" ]; then
  docker cp /tmp/recolector-local.mjs facylf-federacion-1:/app/scripts/recolector-local.mjs >/dev/null 2>&1 \
    && docker restart facylf-federacion-1 >/dev/null 2>&1 && echo "federacion: copiado y reiniciado"
fi

echo "=== contenedores facylf arriba ==="
docker ps --format '{{.Names}}' | grep -c '^facylf'
echo
echo "=== ¿el fichero nuevo esta dentro? (CARRIL / REPARA) ==="
for f in aragon asturias extremadura federacion; do
  c="facylf-${f}-1"
  printf '  %-16s carril=%s repara=%s\n' "$f" \
    "$(docker exec "$c" grep -c CARRIL_DESCUBRIMIENTO /app/scripts/recolector-local.mjs 2>/dev/null)" \
    "$(docker exec "$c" grep -c reparaActasSinTrabajo /app/scripts/recolector-local.mjs 2>/dev/null)"
done
echo
echo "=== ultimas lineas de las que estaban paradas (¿arrancan o dan error?) ==="
for f in aragon asturias extremadura; do
  echo "--- facylf-${f}-1"
  docker logs "facylf-${f}-1" --tail 5 2>&1 | cut -c1-135
done
echo
echo "=== ¿algun error de importacion o de sintaxis? ==="
for f in $FEDS; do
  if docker logs "facylf-${f}-1" --tail 60 2>&1 | grep -qiE 'SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND|is not a function|ReferenceError'; then
    echo "  *** facylf-${f}-1 tiene errores:"
    docker logs "facylf-${f}-1" --tail 60 2>&1 | grep -iE 'SyntaxError|Cannot find module|ERR_MODULE_NOT_FOUND|is not a function|ReferenceError' | tail -2 | cut -c1-140
  fi
done
echo "  (si no sale nada arriba, ningun contenedor tiene errores)"
