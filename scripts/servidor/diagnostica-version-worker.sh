#!/usr/bin/env bash
# diagnostica-version-worker.sh — ¿qué código está ejecutando DE VERDAD el worker de una federación?
#
# ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────────────────────────────
#
# El 24/09/2026 quedó una contradicción sin resolver: el contenedor de Madrid tenía montado el
# `recolector-local.mjs` corregido (`grep -c fallosDeRed` dentro del contenedor daba 8), pero su registro de
# las 10:21 seguía imprimiendo «Pausa global preventiva … por fallos repetidos», que es una frase que la
# corrección ELIMINÓ. Las tres explicaciones posibles se distinguen con datos, no con suposiciones:
#
#   · el worker arrancó ANTES de que el montaje existiera (código viejo en memoria);
#   · ejecuta OTRA copia del script distinta de la que se mira;
#   · el registro lo escribe otro contenedor o otro proceso.
#
# SÓLO LEE.
#
# Uso:  bash scripts/servidor/diagnostica-version-worker.sh <federación> [contenedor]
set -uo pipefail
export LC_ALL=C

FED="${1:?uso: diagnostica-version-worker.sh <federación> [contenedor]}"
C="${2:-facylf-${FED}-1}"

echo "══ ${FED} · contenedor ${C} ══"
echo "· creado:    $(docker inspect "$C" --format '{{.Created}}' 2>&1)"
echo "· arrancado: $(docker inspect "$C" --format '{{.State.StartedAt}}' 2>&1)"
echo "· reloj del host: $(date -Is)"

echo
echo "── montajes que tocan scripts/ ──"
docker inspect "$C" --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' 2>&1 \
  | grep -i 'script' || echo '  (ninguno: el código es el de la imagen)'

echo
echo "── el fichero que ve el contenedor ──"
docker exec "$C" sh -c 'ls -la /app/scripts/recolector-local.mjs /app/scripts/recolector-valencia.mjs 2>/dev/null' 2>&1
echo "  md5 dentro del contenedor:"
docker exec "$C" md5sum /app/scripts/recolector-local.mjs /app/scripts/recolector-valencia.mjs 2>&1
echo "  md5 en el host:"
md5sum /srv/data/facylf/scripts/recolector-local.mjs /srv/data/facylf/scripts/recolector-valencia.mjs 2>&1

echo
echo "── ¿qué código lleva cada copia? (marcas exclusivas de la corrección) ──"
# «fallosDeRed»      sólo existe en el código corregido.
# «por fallos repetidos» sólo existe en el código VIEJO: la corrección cambió esa frase por «por ${motivo}».
for ruta in /app/scripts/recolector-local.mjs /app/scripts/recolector-valencia.mjs; do
  nueva=$(docker exec "$C" grep -c 'fallosDeRed' "$ruta" 2>/dev/null || echo 0)
  vieja=$(docker exec "$C" grep -c 'por fallos repetidos' "$ruta" 2>/dev/null || echo 0)
  printf '  %-42s corregido=%s  viejo=%s\n' "$ruta" "${nueva:-0}" "${vieja:-0}"
done

echo
echo "── procesos del worker y su hora de arranque ──"
# `etimes` es segundos desde el arranque del proceso: con la hora del host se sabe si el worker es anterior o
# posterior al montaje. Un worker anterior al fichero montado explica todo por sí solo.
docker exec "$C" ps -eo pid,etimes,cmd 2>&1 | grep -E 'recolector|entrada-recolector|PID' | head -8

echo
echo "── el lanzador: ¿qué script ejecuta el supervisor? ──"
docker exec "$C" sh -c 'grep -n "recolector-local\|recolector-valencia\|worker-programado" /app/docker/entrada-recolector.sh | head -8' 2>&1
