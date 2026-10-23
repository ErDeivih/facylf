#!/bin/bash
# El importador corre DENTRO de su contenedor (el host no tiene pnpm), así que el fallo se reproduce ahí.
# Y la ruta del fichero de clasificación es t<temporada>-<etiqueta>/comp-<comp>/grupo-<grupo>/.
echo "=== EL GRUPO QUE FALLA, DENTRO DEL CONTENEDOR, CON TODA LA SALIDA ==="
timeout 600 docker exec facylf-importador sh -c 'cd /app && pnpm --filter @facylf/canonico importar --federacion aragon --temporada 2026-27 --grupo 23200330' 2>&1 | tail -35
echo
echo "=== ¿DONDE ESTA EL FICHERO DE CLASIFICACION DE ESE GRUPO? ==="
find /srv/ssd/facylf/aragon /srv/data/facylf/descargas-aragon -maxdepth 4 -type d -name 'grupo-*' 2>/dev/null | head -3
echo "  --- buscando clasificacion del grupo 23200330 ---"
find /srv/ssd/facylf/aragon /srv/data/facylf/descargas-aragon -maxdepth 5 -name 'clasificacion.*' -path '*23200330*' 2>/dev/null | head -5
echo "  --- y en general, cuantos ficheros de clasificacion hay en aragon ---"
find /srv/ssd/facylf/aragon /srv/data/facylf/descargas-aragon -maxdepth 5 -name 'clasificacion.*' 2>/dev/null | wc -l
find /srv/ssd/facylf/aragon /srv/data/facylf/descargas-aragon -maxdepth 5 -name 'clasificacion.*' 2>/dev/null | head -3
