#!/usr/bin/env bash
# aplica-prioridad-federacion.sh — pone en vigor la prioridad máxima de Castilla y León en el servidor
#
# ── POR QUÉ DOS CAMINOS Y NO UNO ─────────────────────────────────────────────────────────────────────────
#
# La prioridad son DOS cosas y no se aplican igual:
#
#   · `cpus` (cuota de CPU) se puede cambiar EN CALIENTE con `docker update`, sin recrear el contenedor. Es el
#     camino rápido y hace efecto al instante.
#   · `FACYLF_TURNO_PLAZA_MIN` es una VARIABLE DE ENTORNO: sólo cambia recreando el contenedor. Y recrear es
#     justo lo que se ha quedado a medias dos veces hoy, porque el demonio de Docker de esta máquina responde
#     muy despacio (se han visto `docker ps` agotando cinco minutos).
#
# Así que se aplica lo que se puede ya (la CPU) y se deja lanzada la recreación para el turno, comprobando al
# final qué quedó de verdad puesto en vez de dar por hecho que se aplicó todo.
#
# SÓLO toca el contenedor de `federacion`.
#
# Uso:  bash scripts/servidor/aplica-prioridad-federacion.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/aplica-prioridad.log
exec > "$REGISTRO" 2>&1

echo "══ 1. Antes · $(date -Is) ══"
docker inspect facylf-federacion-1 --format '  estado={{.State.Status}} cpu={{.HostConfig.NanoCpus}}' 2>&1
printf '  turno de plaza: %s\n' "$(docker exec facylf-federacion-1 printenv FACYLF_TURNO_PLAZA_MIN 2>&1)"

echo
echo "── 2. Cuota de CPU en caliente (no necesita recrear) ──"
docker update --cpus=1.4 facylf-federacion-1 2>&1 | sed 's/^/  /'
docker inspect facylf-federacion-1 --format '  cpu ahora={{.HostConfig.NanoCpus}}' 2>&1

echo
echo "── 3. Recreación para el turno (lanzada; puede tardar) ──"
# Con `timeout` para no quedarse colgado indefinidamente si el demonio no contesta: si se agota, la cuota de CPU
# ya está aplicada y el turno se aplicará en la siguiente recreación.
timeout 900 docker compose --project-name facylf --env-file docker/.env \
  -f docker/compose.yml -f docker/compose-turnos.yml up -d federacion 2>&1 | tail -4
codigo=$?
[ "$codigo" = "124" ] && echo "  (la recreación se agotó por tiempo; el turno queda pendiente)"

echo
echo "── 4. Esperando a que esté en pie ──"
for intento in $(seq 1 40); do
  estado=$(docker inspect facylf-federacion-1 --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  [ "$estado" = "running" ] && break
  sleep 5
done
docker inspect facylf-federacion-1 --format '  estado={{.State.Status}} cpu={{.HostConfig.NanoCpus}}' 2>&1
printf '  turno de plaza: %s\n' "$(docker exec facylf-federacion-1 printenv FACYLF_TURNO_PLAZA_MIN 2>&1)"

echo
echo "── 5. Y sigue recogiendo su temporada ──"
tail -30 /srv/data/facylf/descargas-federacion/recolector-local/worker-programado.log 2>/dev/null \
  | grep '^→ ' | cut -d'|' -f2 | sort | uniq -c | sed 's/^/  temporada /'
tail -2 /srv/data/facylf/descargas-federacion/recolector-local/worker-programado.log 2>/dev/null | sed 's/^/  /'

echo
echo "══ fin · $(date -Is) ══"
