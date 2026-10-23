#!/usr/bin/env bash
# arranca-federacion-con-filtro.sh — deja Castilla y León en el servidor con el filtro de temporadas montado
#
# ── QUÉ PASÓ (24/09/2026, 17:5x) ────────────────────────────────────────────────────────────────────────
#
# Para que el servidor respetara el reparto por temporadas había que montarle dos ficheros de código (el filtro y
# la biblioteca que lo usa), porque el código de los recolectores vive DENTRO de la imagen y la imagen es anterior
# al cambio. Se lanzó `up -d federacion` y **el comando se agotó por tiempo a mitad**: el demonio de Docker de
# esta máquina responde muy despacio, y el contenedor se quedó PARADO sin llegar a recrearse. Es decir: durante
# unos minutos Castilla y León no se recogió en ningún sitio.
#
# Por eso esto va en un guion desacoplado y con registro, que es como se hacen aquí todas las operaciones lentas
# de Docker: si la sesión se corta, el trabajo sigue.
#
# SÓLO toca el servicio `federacion`.
#
# Uso:  bash scripts/servidor/arranca-federacion-con-filtro.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/arranca-federacion.log
exec > "$REGISTRO" 2>&1

echo "══ 1. Estado de partida · $(date -Is) ══"
docker inspect facylf-federacion-1 --format '  estado={{.State.Status}} arrancado={{.State.StartedAt}}' 2>&1

echo
echo "── 2. Levantando con los montajes nuevos ──"
docker compose --project-name facylf --env-file docker/.env \
  -f docker/compose.yml -f docker/compose-turnos.yml up -d federacion 2>&1 | tail -5

echo
echo "── 3. Esperando a que arranque ──"
for intento in $(seq 1 60); do
  estado=$(docker inspect facylf-federacion-1 --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  [ "$estado" = "running" ] && { echo "  running tras ${intento} intento(s)"; break; }
  sleep 5
done
docker inspect facylf-federacion-1 --format '  estado final={{.State.Status}} arrancado={{.State.StartedAt}}' 2>&1

echo
echo "── 4. ¿Lleva montado el filtro? ──"
docker inspect facylf-federacion-1 --format '{{range .Mounts}}{{.Source}}{{"\n"}}{{end}}' 2>&1 \
  | grep -E 'temporadas-asignadas|lib/recolector-local' | sed 's/^/  /' || echo '  NO ESTÁ MONTADO'

echo
echo "── 5. ¿Ve desde dentro el fichero de asignación? ──"
docker exec facylf-federacion-1 sh -c 'tail -1 /app/descargas-federacion/recolector-local/temporadas-asignadas.txt' 2>&1 | sed 's/^/  /'

echo
echo "── 6. Y que el módulo lo lea dentro del contenedor ──"
# El código va en un fichero aparte a propósito: con `node -e "<javascript>"` en la línea de órdenes, Windows
# PowerShell destroza las comillas (ya pasó dos veces hoy) y el JavaScript llega roto.
docker exec facylf-federacion-1 node /app/scripts/servidor/lee-temporadas-asignadas.mjs 2>&1 \
  | grep -v Experimental | grep -v trace-warnings | sed 's/^/  /'

echo
echo "══ fin · $(date -Is) ══"
