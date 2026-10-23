#!/usr/bin/env bash
# activa-arreglo-pausas.sh — pone en marcha el arreglo de las pausas globales por fallos de red
#
# ── QUÉ HACE Y POR QUÉ ASÍ ──────────────────────────────────────────────────────────────────────────────
#
# El arreglo (un fallo de red ya no cuenta como fallo de la federación) vive en `recolector-local.mjs` y
# `recolector-valencia.mjs`. Los recolectores llevan el código DENTRO de la imagen, así que para que lo usen hay
# que recrear el contenedor; y para evitar los ~25 min de CPU de reconstruir la imagen (que saldrían de la propia
# recolección), los dos scripts van MONTADOS desde el repositorio en estos tres servicios (ver `compose.yml`).
#
# TRES DETALLES QUE IMPORTAN:
#
#  1. Se pasan LOS DOS ficheros de compose. `docker/compose-turnos.yml` fija `cpus` por servicio y su turno de
#     plaza; recrear sólo con `compose.yml` devolvería a Madrid de 0,81 a 0,5 de CPU y le quitaría su turno. La
#     foto de antes y después está para demostrar que no se ha degradado nada.
#  2. Se eligen Madrid, Valencia y Castilla y León porque son LAS TRES ÚNICAS que se paran: 24 h medidas el
#     24/09/2026 dan 16 pausas en Madrid, 5 en Valencia y 1 en Castilla y León, y CERO en las otras dieciséis. Las
#     que no se paran no ganan nada con recrearse ahora, y recrearlas cuesta su sesión de Chrome y su catálogo.
#  3. Después se retira la pausa vigente. Es una pausa que existe por el fallo que se acaba de corregir —cinco
#     `fetch failed` o cinco tiempos agotados—, y `limpiar-pausa.mjs` existe justo para deshacer el efecto de un
#     veredicto equivocado. Sin esto, el worker nuevo se quedaría esperando a que caduque.
#
# Uso:  bash scripts/servidor/activa-arreglo-pausas.sh [servicio...]
#       Sin argumentos hace los tres afectados (madrid, valencia, federacion).
set -uo pipefail
cd /srv/data/facylf || exit 1

if [ $# -gt 0 ]; then
  SERVICIOS=("$@")
else
  SERVICIOS=(madrid valencia federacion)
fi

# La pausa se retira llamando a `limpiar-pausa.mjs`, que conoce los nombres de carpeta: Castilla y León es la
# única cuyo directorio no se llama como el servicio (`descargas-federacion`), y allí hay que pedirla como
# `castilla-leon`.
declare -A NOMBRE_PAUSA=([federacion]=castilla-leon [madrid]=madrid [valencia]=valencia)

COMPOSE=(docker compose --project-name facylf --env-file docker/.env
         -f docker/compose.yml -f docker/compose-turnos.yml)

echo "══ 1. Estado ANTES ══"
bash scripts/servidor/estado-turnos-cpu.sh "${SERVICIOS[@]}"

echo
echo "══ 2. Recreando ${SERVICIOS[*]} (con los dos ficheros de compose) ══"
"${COMPOSE[@]}" up -d "${SERVICIOS[@]}" 2>&1 | tail -6

echo
echo "══ 3. Retirando la pausa que dejó el fallo ya corregido ══"
for fed in "${SERVICIOS[@]}"; do
  nombre="${NOMBRE_PAUSA[$fed]:-$fed}"
  echo "-- ${fed} (carpeta ${nombre})"
  docker exec facylf-monitor node /app/scripts/limpiar-pausa.mjs --federacion "$nombre" 2>&1 \
    | grep -v -E 'ExperimentalWarning|trace-warnings' || true
done

echo
echo "══ 4. Estado DESPUÉS (debe coincidir con el de antes en CPU y turno) ══"
sleep 5
bash scripts/servidor/estado-turnos-cpu.sh "${SERVICIOS[@]}"
