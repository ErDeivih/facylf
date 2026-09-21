#!/usr/bin/env bash
# Arranca en el servidor las federaciones que ya tienen su cola copiada y verifica que piden de verdad.
# Es el paso 4 y 5 del traspaso, sin volver a copiar (la cola no ha cambiado: en el PC están excluidas).
set -uo pipefail

FEDERACIONES="${1:-baleares canarias cantabria}"

for F in $FEDERACIONES; do
  echo "════ $F ════"
  if [ ! -f "/srv/data/facylf/descargas-$F/recolector-local/cola-v2.sqlite" ]; then
    echo "  ✗ no tiene cola copiada: no se arranca nada"
    continue
  fi
  echo -n "  cola: "; du -h "/srv/data/facylf/descargas-$F/recolector-local/cola-v2.sqlite" | cut -f1
  cd /srv/data/facylf || exit 1
  docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml up -d "$F" 2>&1 | tail -1
  sleep 45
  echo "  registro:"
  tail -4 "/srv/data/facylf/descargas-$F/recolector-local/worker-programado.log" 2>/dev/null | sed 's/^/    /'
  echo -n "  errores de DNS: "
  grep -c 'ERR_NAME_NOT_RESOLVED' "/srv/data/facylf/descargas-$F/recolector-local/worker-programado.log" 2>/dev/null || echo 0
done

echo
echo "════ contenedores de facylf ════"
docker ps --filter name=facylf- --format '  {{.Names}} · {{.Status}}'
