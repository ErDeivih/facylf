#!/bin/bash
# PENDIENTE 4, CIERRE: los 150 «fallos» del importador son falsos negativos —el grupo entra y el CLI sale con
# código distinto de cero—, y el arreglo ya está en `importar-masivo.mjs`. Pero el estado guarda esos fallos y
# el importador no los reintenta: se queda con 150 grupos marcados que sí entrarían.
#
# Aquí se limpia esa lista (con respaldo) para que los vuelva a intentar. Los que ya estén dentro no se
# duplican: el importador es idempotente y da «0 filas insertadas».
cd /srv/data/facylf || exit 1
echo "=== ESTADO ANTES ==="
cat estado/importacion-resumen.json 2>/dev/null

echo
echo "=== PARAR EL IMPORTADOR PARA NO PELEARNOS CON SU ESTADO ==="
docker stop -t 30 facylf-importador >/dev/null 2>&1 && echo "  parado"

echo
echo "=== RESPALDO Y LIMPIEZA DE LA LISTA DE FALLOS ==="
cp estado/importacion.json "estado/importacion.json.antes-de-limpiar-$(date +%Y%m%d-%H%M)" 2>/dev/null && echo "  respaldo guardado"
docker run --rm -v /srv/data/facylf/estado:/estado node:22-alpine node -e "
const fs = require('fs');
const ruta = '/estado/importacion.json';
const j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
const antes = Object.keys(j.fallos ?? {}).length;
j.fallos = {};
fs.writeFileSync(ruta, JSON.stringify(j, null, 2));
console.log('  fallos borrados: ' + antes + ' (se reintentarán)');
console.log('  hechos que se conservan: ' + Object.keys(j.hechos ?? {}).length);
" 2>&1

echo
echo "=== ARRANCAR EL IMPORTADOR ==="
docker start facylf-importador >/dev/null 2>&1 && echo "  arrancado"
sleep 20
docker inspect -f '  estado: {{.State.Status}}' facylf-importador 2>/dev/null

echo
echo "=== ESTADO DESPUÉS ==="
cat estado/importacion-resumen.json 2>/dev/null
echo
echo "=== LO QUE VE EL RECOLECTOR AL ARRANCAR ==="
sleep 25
docker logs --tail 6 facylf-importador 2>&1 | cut -c1-160
