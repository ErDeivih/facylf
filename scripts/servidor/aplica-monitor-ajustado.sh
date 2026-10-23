#!/bin/bash
# Recrea SÓLO el monitor con la cadencia y la cuota nuevas. No toca ningún recolector.
cd /srv/data/facylf || exit 1
echo "=== VALIDAR EL YAML ANTES DE APLICAR ==="
docker compose --env-file docker/.env -f docker/monitor.yml config >/dev/null 2>&1 && echo "  YAML correcto" || { echo "  YAML ROTO: no se aplica nada"; exit 1; }
echo
echo "=== RECREAR EL MONITOR ==="
docker compose --env-file docker/.env -f docker/monitor.yml up -d 2>&1 | tail -5
sleep 6
echo
echo "=== ESTADO ==="
docker ps --filter name=facylf-monitor --format '{{.Names}}  {{.Status}}'
docker inspect -f 'cuota_cpu_nano={{.HostConfig.NanoCpus}}' facylf-monitor 2>/dev/null
docker exec facylf-monitor printenv FACYLF_COLAS_POR_VUELTA FACYLF_EXCLUIR 2>/dev/null
echo
echo "=== PRIMERAS LINEAS ==="
docker logs --tail 12 facylf-monitor 2>&1 | cut -c1-150
