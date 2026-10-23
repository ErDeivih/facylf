#!/bin/bash
# Relanza lo que falte SIN reiniciar el daemon (es idempotente: a los que ya están arriba no los toca).
cd /srv/data/facylf || exit 1
echo "=== RECOLECTORES ==="
timeout 900 docker compose -p facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml up -d 2>&1 | tail -8
echo
echo "=== IMPORTADOR ==="
timeout 300 docker compose -p facylf --env-file docker/.env -f docker/importador.yml up -d 2>&1 | tail -3
echo
echo "=== MONITOR ==="
timeout 300 docker compose -p docker --env-file docker/.env -f docker/monitor.yml up -d 2>&1 | tail -3
echo
echo "=== COMPROBACION POR INSPECT (que si responde) ==="
for fed in postgres web importador monitor murcia navarra galicia federacion andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura melilla rioja; do
  printf '  %-24s %s\n' "$fed" "$(timeout 20 docker inspect -f '{{.State.Status}}' "facylf-$fed" 2>/dev/null || echo '?')"
done
echo
uptime
