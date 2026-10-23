#!/bin/bash
# Verificación final tras la recuperación.
echo "=== CARGA Y PROCESOS ==="
uptime
echo -n "procesos: "; ps -e --no-headers 2>/dev/null | wc -l
echo
echo "=== CONTENEDORES ==="
timeout 150 docker ps --format '{{.Names}}|{{.Status}}' 2>/dev/null | sort | awk -F'|' '{ printf "  %-30s %s\n", $1, $2 }'
echo
echo "=== COLAS: ¿RESUELVEN DENTRO DE CADA CONTENEDOR? ==="
for c in $(timeout 120 docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^facylf-.*-1$' | head -20); do
  r=$(docker exec "$c" sh -c 'ls -l /app/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | head -1 | sed "s/.*-> //"' 2>/dev/null)
  printf '  %-28s %s\n' "$c" "${r:-sin cola}"
done
echo
echo "=== ¿ESTÁ PIDIENDO? (ultima linea del monitor) ==="
docker logs --tail 6 facylf-monitor 2>&1 | grep -E 'federación|trabajando|sin-trabajo|avisos|memoria' | head -6
