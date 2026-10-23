#!/bin/bash
# Repara los recolectores que quedaron atascados tras mover su cola al SSD.
#
# QUÉ PASÓ: al parar el contenedor con el daemon saturado (load 30-50), containerd dejó un objeto de tarea
# obsoleto y el contenedor quedó en `exited:128` con el error
#   `could not load stale containerd task object: DeadlineExceeded: context deadline exceeded`
# `docker start` no puede recuperarlo: hay que quitar el contenedor y volver a crearlo con LOS TRES ficheros de
# compose (base + turnos + monitor no hace falta), para que conserve su cuota de CPU y su turno de plaza.
cd /srv/data/facylf || exit 1
FICHEROS="--env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml"

for fed in "$@"; do
  cont="facylf-$fed-1"
  estado=$(docker inspect -f '{{.State.Status}}' "$cont" 2>/dev/null)
  if [ "$estado" = "running" ]; then
    echo "--- $fed: ya está arriba"
    continue
  fi
  echo "--- $fed: estado '$estado' -> se recrea"
  docker rm -f "$cont" >/dev/null 2>&1
  docker compose -p facylf $FICHEROS up -d "$fed" 2>&1 | tail -2
  sleep 4
  nuevo=$(docker inspect -f '{{.State.Status}}:{{.State.ExitCode}}' "$cont" 2>/dev/null)
  cuota=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$cont" 2>/dev/null)
  turno=$(docker exec "$cont" printenv FACYLF_TURNO_PLAZA_MIN 2>/dev/null)
  echo "    estado=$nuevo cuota=$cuota turno=$turno"
done

echo
echo "=== COMO QUEDAN TODOS ==="
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia; do
  cont="facylf-$fed-1"
  s=$(docker inspect -f '{{.State.Status}}' "$cont" 2>/dev/null)
  printf '%-22s %s\n' "$fed" "${s:-no existe}"
done
