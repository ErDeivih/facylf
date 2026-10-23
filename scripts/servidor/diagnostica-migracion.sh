#!/bin/bash
# Diagnóstico de la migración: ¿qué contenedores han vuelto y cuáles no?
echo "=== ESTADO DE TODOS LOS RECOLECTORES ==="
docker ps -a --format '{{.Names}}|{{.Status}}' 2>/dev/null | grep '^facylf-' | sort | awk -F'|' '{ printf "%-30s %s\n", $1, $2 }'
echo
echo "=== NAVARRA EN DETALLE ==="
docker inspect -f 'estado={{.State.Status}} salida={{.State.ExitCode}} error={{.State.Error}} arrancado={{.State.StartedAt}}' facylf-navarra-1 2>&1
echo "--- sus ultimos registros ---"
docker logs --tail 30 facylf-navarra-1 2>&1 | tail -30
echo "--- ¿hay procesos dentro? ---"
docker top facylf-navarra-1 2>&1 | head -5
