#!/bin/bash
# ¿Por qué la consulta de «temporada más reciente aparcada» no devuelve nada? Sín silenciar el error.
set -u
S=/srv/ssd/facylf/scripts/servidor/temporada-aparcada-mas-reciente.mjs
echo "=== ¿existe el fichero y donde? ==="
ls -la "$S" 2>&1
echo "=== ¿lo ve el contenedor? ==="
docker exec facylf-aragon-1 ls -la "$S" 2>&1
echo "=== ejecutando SIN silenciar errores ==="
docker exec facylf-aragon-1 node "$S" /app/descargas-aragon/recolector-local/cola-v2.sqlite 2>&1 | head -12
echo "=== ¿que dice la cola directamente? (consulta equivalente) ==="
docker exec facylf-aragon-1 node /srv/ssd/facylf/scripts/diagnostica-aplazados.mjs /app/descargas-aragon/recolector-local/cola-v2.sqlite aragon 2>&1 | grep -A4 'POR FECHA'
