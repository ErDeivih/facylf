#!/usr/bin/env bash
# ── PONE EL IMPORTADOR MASIVO AL DÍA DENTRO DE SU CONTENEDOR (30/09/2026) ─────────────────────────────────────
#
# Diagnóstico (estado/claude/respuestas/01-importador-lento.txt): la imagen del importador es del 23/09 y NO
# lleva el arreglo del 25/09 (`entroEntero`): un grupo que entra entero pero cuyo CLI sale con código 1 se
# cuenta como fallo y se reintenta tres veces. En Andalucía 2025-26 cada intento son 15-20 min reescribiendo
# ~10.000 filas iguales: 9 grupos hechos en 8 h y 12.933 esperando.
#
# Qué hace: copia el `scripts/importar-masivo.mjs` y `scripts/lib/importacion-masiva.mjs` del repositorio del
# servidor (que sí tienen el arreglo) DENTRO del contenedor, y comprueba las huellas. No reinicia nada: el
# contenedor relanza `node /app/scripts/importar-masivo.mjs` en cada tanda, así que la siguiente ya usa el
# código nuevo. Se pierde si el contenedor se recrea: entonces toca reconstruir la imagen.
# Además limpia los fallos de los grupos que ya entraron enteros, para que no esperen su tercer intento.
set -uo pipefail
RAIZ=/srv/data/facylf
C=facylf-importador
grep -q entroEntero "$RAIZ/scripts/importar-masivo.mjs" || { echo "el repositorio del servidor tampoco tiene el arreglo: no se copia nada"; exit 1; }
for f in scripts/importar-masivo.mjs scripts/lib/importacion-masiva.mjs; do
  docker cp "$RAIZ/$f" "$C:/app/$f" || { echo "no se pudo copiar $f"; exit 1; }
  h=$(md5sum "$RAIZ/$f" | cut -c1-12); c=$(docker exec "$C" md5sum "/app/$f" | cut -c1-12)
  echo "$f  host $h · contenedor $c  $([ "$h" = "$c" ] && echo OK || echo DISTINTO)"
done
echo "¿arreglo entroEntero dentro? $(docker exec $C grep -c entroEntero /app/scripts/importar-masivo.mjs)"
[ -f "$RAIZ/scripts/servidor/limpia-fallos-importador.sh" ] && echo "(hay limpia-fallos-importador.sh; no se ejecuta aquí: revisar antes)"
