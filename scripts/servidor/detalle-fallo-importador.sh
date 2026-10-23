#!/bin/bash
# El error completo de un grupo que "falla", sin truncar, y el resumen que lo sigue.
echo "=== CONTEXTO DE UN FALLO DE ARAGON ==="
docker logs --since 10h facylf-importador 2>&1 | grep -A 25 'fallo aragon|2026-27|23200330' | head -30
echo
echo "=== CONTEXTO DE UN FALLO DE ANDALUCIA ==="
docker logs --since 10h facylf-importador 2>&1 | grep -A 25 'fallo andalucia|2025-26|45983670' | head -30
echo
echo "=== ¿CUANTOS 'hecho' Y CUANTOS 'fallo' EN TODO EL REGISTRO DEL CONTENEDOR? ==="
docker logs facylf-importador 2>&1 | grep -c '  hecho '
docker logs facylf-importador 2>&1 | grep -c '  fallo '
echo
echo "=== COLA DE IMPORTACION (estado segun el propio importador) ==="
docker logs --since 10h facylf-importador 2>&1 | grep -E 'tanda (terminada|agotada|iniciada)|COLA|pendientes' | tail -12
