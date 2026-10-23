#!/usr/bin/env bash
# estado-turnos-cpu.sh — qué CPU, qué turno y qué argumentos tiene cada recolector en marcha
#
# ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
#
# Al recrear un servicio hay que pasar LOS DOS ficheros de compose. `docker/compose-turnos.yml` fija `cpus` por
# servicio (madrid 0.52, valencia 0.5…) y su `FACYLF_TURNO_PLAZA_MIN`; si se recrea sólo con `compose.yml`, ese
# servicio vuelve al `0.5` del ancla y pierde su turno de plaza sin que nada avise. Este guion deja el estado
# ANTES y DESPUÉS para poder comparar y demostrar que no se ha degradado nada.
#
# SÓLO LEE (docker inspect). No toca contenedores.
#
# Uso:  bash scripts/servidor/estado-turnos-cpu.sh [servicio...]
set -uo pipefail
export LC_ALL=C

SERVICIOS=("$@")
if [ ${#SERVICIOS[@]} -eq 0 ]; then
  mapfile -t SERVICIOS < <(docker ps --filter name=facylf- --format '{{.Names}}' 2>/dev/null \
    | grep -v -E 'importador|monitor|web|postgres|fin-de-semana' | sed 's/^facylf-//; s/-1$//' | sort)
fi

printf '%-22s %8s %10s %12s  %s\n' SERVICIO CPU_NANOS CPU_TEXTO TURNO_MIN ARGS
for fed in "${SERVICIOS[@]}"; do
  c="facylf-${fed}-1"
  docker inspect "$c" >/dev/null 2>&1 || { printf '%-22s %8s\n' "$fed" '(no existe)'; continue; }
  nanos=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$c" 2>/dev/null)
  [ "$nanos" = "0" ] && nanos="(sin límite)"
  cpu=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$c" 2>/dev/null | awk '{ if ($1 > 0) printf "%.2f", $1/1000000000; else print "-" }')
  turno=$(docker exec "$c" printenv FACYLF_TURNO_PLAZA_MIN 2>/dev/null || echo '-')
  args=$(docker exec "$c" printenv FACYLF_ARGS 2>/dev/null || echo '-')
  printf '%-22s %8s %10s %12s  %s\n' "$fed" "$nanos" "$cpu" "${turno:--}" "${args:--}"
done

echo
echo "── ¿lleva montado el script corregido? (sólo los tres federaciones tocadas hoy) ──"
for fed in madrid valencia federacion; do
  c="facylf-${fed}-1"
  docker inspect "$c" >/dev/null 2>&1 || continue
  script="recolector-local.mjs"
  [ "$fed" = "valencia" ] && script="recolector-valencia.mjs"
  montado=$(docker inspect -f '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}' "$c" 2>/dev/null \
    | grep "scripts/${script}" || true)
  if [ -n "$montado" ]; then echo "  ${fed}: MONTADO  ${montado##*/}"
  else
    # Sin montaje, el código es el de la imagen: se comprueba si la copia de dentro ya trae el arreglo.
    if docker exec "$c" grep -q 'fallosDeRed' "/app/scripts/${script}" 2>/dev/null; then
      echo "  ${fed}: copia dentro del contenedor YA trae el arreglo (sin montaje)"
    else
      echo "  ${fed}: SIN el arreglo (imagen vieja y sin montaje)"
    fi
  fi
done
