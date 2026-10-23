#!/bin/bash
# CASTILLA Y LEÓN: ¿está ingiriendo bien en el SERVIDOR?
#
# El reparto es por TEMPORADAS, no por federación: este PC recoge 2025-26, 2023-24 y 2021-22, y el servidor
# 2026-27, 2024-25 y 2022-23. Que los dos corran a la vez es lo previsto; lo que NO puede pasar es que se
# solapen, porque serían peticiones duplicadas a la misma federación.
echo "=== TEMPORADAS QUE TIENE ASIGNADAS CADA UNO ==="
echo "  --- en el servidor ---"
docker exec facylf-federacion-1 sh -c 'cat /app/descargas-federacion/recolector-local/temporadas-asignadas.txt 2>/dev/null | grep -v "^#" | grep -v "^$"' 2>&1 | sed 's/^/    /'
echo
echo "=== EL RECOLECTOR DE CYL EN EL SERVIDOR ==="
docker inspect -f '  {{.Name}} {{.State.Status}} desde {{.State.StartedAt}}' facylf-federacion-1 2>&1
echo
echo "=== ¿ESTÁ PIDIENDO? (últimas líneas de su registro) ==="
docker exec facylf-federacion-1 sh -c 'tail -12 /app/descargas-federacion/recolector-local/worker-programado.log 2>/dev/null' 2>&1 | sed 's/^/  /'
echo
echo "=== RITMO: ACTAS GUARDADAS Y EN LA ÚLTIMA HORA ==="
docker exec facylf-federacion-1 sh -c 'ls -la /app/descargas-federacion/recolector-local/ | head -8' 2>&1 | sed 's/^/  /'
echo
echo "=== COLA DE CYL EN EL SERVIDOR ==="
docker exec facylf-federacion-1 sh -c 'ls -l /app/descargas-federacion/recolector-local/cola-v2.sqlite' 2>&1 | sed 's/^/  /'
echo
echo "=== EL MONITOR: QUÉ DICE DE FEDERACION ==="
docker logs --tail 40 facylf-monitor 2>&1 | grep -E 'federacion' | tail -3 | sed 's/^/  /'
echo
echo "=== AVISOS ==="
docker logs --tail 60 facylf-monitor 2>&1 | grep -iE 'aviso|atascada' | tail -4 || echo "  sin avisos"
