#!/bin/bash
# ── DESPLIEGA EL RECOLECTOR ACTUAL EN LOS CONTENEDORES DEL SERVIDOR ──────────────────────────────────────
#
# Los contenedores NO leen el repositorio: su `/app/scripts/` viene de la IMAGEN, y la imagen del servidor es
# del 23 de septiembre. Comprobado el 06/10/2026:
#
#   /app/scripts/recolector-local.mjs   → fichero de la imagen, root, del 23/09
#   /srv/ssd/facylf/                    → es DATOS por federación, no el repositorio
#
# Así que lo que hace falta es copiar el fichero DENTRO de cada contenedor y reiniciarlo. Es el mismo patrón
# que ya usa `actualiza-importador.sh`.
#
# Qué entra con este fichero, y por qué importa:
#
#   1. EL CARRIL DE DESCUBRIMIENTO (línea ~744): los índices de jornadas y los grupos van por delante de las
#      actas de temporadas viejas de competiciones altas. Sin esto, doce federaciones del servidor se quedan
#      sin trabajo encolado: medido el 06/10/2026, Asturias tenía 34.761 trabajos aplazados y 0 pendientes,
#      Aragón 31.299, Extremadura 26.528… y NINGUNA de ellas tenía un solo índice de jornadas en cola. Sin
#      índice no hay partidos, y por eso «no tenían trabajo». No era cierto: tenían el trabajo sin encolar.
#
#   2. `reparaActasSinTrabajo`: devuelve a la cola las actas que están guardadas y NO tienen trabajo asociado
#      —en el servidor hay 1.722 (Asturias 713, Galicia 685, La Rioja 133, Cantabria 128, Canarias 37…)—.
#
# Cómo se comprueba que ha entrado: al final del guion se lee dentro de cada contenedor el número de
# referencias a `CARRIL_DESCUBRIMIENTO` y a `reparaActasSinTrabajo`. Si sale 0 en alguna, no entró.
#
# Uso:  bash despliega-recolector.sh <ruta-al-recolector-local.mjs>   [--aplicar]
set -u
ORIGEN="${1:?uso: despliega-recolector.sh <recolector-local.mjs> [--aplicar]}"
APLICAR=0
[ "${2:-}" = "--aplicar" ] && APLICAR=1

if [ ! -f "$ORIGEN" ]; then echo "no encuentro $ORIGEN"; exit 2; fi
echo "origen: $ORIGEN  ($(wc -c < "$ORIGEN") bytes)"
echo "en el origen: CARRIL_DESCUBRIMIENTO=$(grep -c CARRIL_DESCUBRIMIENTO "$ORIGEN")  reparaActasSinTrabajo=$(grep -c reparaActasSinTrabajo "$ORIGEN")"

FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

echo
printf '%-20s %-12s %-12s %s\n' FEDERACION ANTES_CARRIL ANTES_REPARA ACCION
for f in $FEDS; do
  c="facylf-${f}-1"
  antes_c=$(docker exec "$c" grep -c CARRIL_DESCUBRIMIENTO /app/scripts/recolector-local.mjs 2>/dev/null || echo '?')
  antes_r=$(docker exec "$c" grep -c reparaActasSinTrabajo /app/scripts/recolector-local.mjs 2>/dev/null || echo '?')
  accion='(mirar)'
  if [ "$APLICAR" = "1" ]; then
    # Copia de seguridad DENTRO del contenedor antes de sobrescribir: si el fichero nuevo pidiera algo que la
    # imagen no tiene (las imágenes son del 23/09 y el repositorio ha seguido), se vuelve atrás con un `cp`.
    docker exec "$c" cp /app/scripts/recolector-local.mjs /app/scripts/recolector-local.mjs.previo 2>/dev/null
    docker cp "$ORIGEN" "$c:/app/scripts/recolector-local.mjs" >/dev/null 2>&1 && accion='copiado+reinicio' || accion='FALLO al copiar'
    [ "$accion" = 'copiado+reinicio' ] && docker restart "$c" >/dev/null 2>&1
  fi
  printf '%-20s %-12s %-12s %s\n' "$f" "$antes_c" "$antes_r" "$accion"
done

if [ "$APLICAR" != "1" ]; then
  echo
  echo "  (esto ha sido MIRAR: no se ha copiado nada. Repetir con --aplicar)"
fi
