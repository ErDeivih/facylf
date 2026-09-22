#!/usr/bin/env bash
# ── APLICA LOS TURNOS Y LAS CUOTAS DE PROCESADOR A LA FLOTA DEL SERVIDOR ────────────────────────────────
#
# Coge `docker/compose-turnos.yml` (lo genera `scripts/servidor/calcula-turnos.mjs` a partir del trabajo
# pendiente de cada cola) y recrea los recolectores para que tomen su turno y su cuota.
#
# Por qué recrear y no recargar: el turno y la cuota son variables de entorno y límites del contenedor, y eso
# sólo se aplica al recrear. Recrear NO pierde trabajo: el recolector devuelve a `pendiente` lo que tuviera
# `en_curso` al arrancar (la cola es reanudable) y la plaza de navegador se suelta sola.
#
# Uso:
#   bash scripts/servidor/aplica-turnos.sh --comprobar        # dice qué haría, no toca nada
#   bash scripts/servidor/aplica-turnos.sh                    # todos los recolectores
#   bash scripts/servidor/aplica-turnos.sh murcia navarra     # sólo esos (para un traspaso)
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
FICHERO="$RAIZ/docker/compose-turnos.yml"
COMPROBAR=0
if [ "${1:-}" = "--comprobar" ]; then COMPROBAR=1; shift; fi

cd "$RAIZ" || { echo "no existe $RAIZ"; exit 1; }
[ -f "$FICHERO" ] || { echo "falta $FICHERO: generalo con node scripts/servidor/calcula-turnos.mjs"; exit 1; }

echo "── turno y cuota declarados en $FICHERO ──"
awk '
  /^  [a-z-]+:$/ { fed = $1; sub(":$", "", fed) }
  /FACYLF_TURNO_PLAZA_MIN:/ { gsub(/[^0-9]/, "", $2); turno = $2 }
  /^    cpus:/ { printf "  %-22s turno %4s min   cpu %s\n", fed, turno, $2 }
' "$FICHERO"
echo

SERVICIOS=("$@")
if [ "${#SERVICIOS[@]}" -eq 0 ]; then
  mapfile -t SERVICIOS < <(awk '/^  [a-z-]+:$/ { fed = $1; sub(":$", "", fed); print fed }' "$FICHERO")
fi

if [ "$COMPROBAR" = "1" ]; then
  echo "── modo comprobación: recrearía ${#SERVICIOS[@]} servicio(s) ──"
  echo "   ${SERVICIOS[*]}"
  exit 0
fi

echo "── recreando ${#SERVICIOS[@]} servicio(s) ──"
docker compose --project-name facylf --env-file docker/.env \
  -f docker/compose.yml -f docker/compose-turnos.yml up -d "${SERVICIOS[@]}" 2>&1 | tail -3

echo
echo "── lo que tiene ahora cada contenedor en marcha ──"
for c in $(docker ps --filter name=facylf- --format '{{.Names}}' | grep -v -E 'importador|monitor|web|postgres' | sort); do
  fed=${c#facylf-}; fed=${fed%-1}
  turno=$(docker exec "$c" printenv FACYLF_TURNO_PLAZA_MIN 2>/dev/null)
  cpu=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$c" 2>/dev/null)
  cpu=$(awk -v n="${cpu:-0}" 'BEGIN { printf "%.2f", n / 1000000000 }')
  printf '  %-24s turno %4s min   cpu %s\n' "$fed" "${turno:-?}" "$cpu"
done
