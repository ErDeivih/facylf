#!/usr/bin/env bash
# Pone el ritmo de CyL del servidor a 10-13 s entre peticiones (16/10/2026).
# CyL se recoge desde el PC y desde el servidor contra la MISMA web; con las dos a 6-8 s la web recibía una
# petición cada ~4,8 s. A 10-13 s cada una, entre las dos quedan en una cada ~7 s: dentro de la regla de 5-8 s
# por sitio. Sólo toca recolector.config.json (el de CyL); entra en la siguiente sesión del recolector.
set -euo pipefail
F=/srv/data/facylf/recolector.config.json
cp -a "$F" "$F.antes-ritmo-$(date +%F-%H%M)"
# OJO: NO `sed -i`. `sed -i` crea un fichero NUEVO (otro inodo) y el contenedor, que tiene montado ESTE fichero
# suelto, sigue viendo el viejo hasta que se reinicia. Pasó el 16/10/2026: el servidor decía 10/13 y el contenedor
# de CyL seguía a 6/8 (petición 156). Se reescribe el contenido en el mismo inodo y, aun así, se reinicia.
T=$(mktemp)
sed -E 's/("intervaloMinSeg": *)[0-9]+/\110/; s/("intervaloMaxSeg": *)[0-9]+/\113/' "$F" > "$T"
cat "$T" > "$F"; rm -f "$T"
grep -n intervalo "$F"
echo "dentro del contenedor (tiene que decir lo mismo):"
docker exec facylf-federacion-1 grep -n intervalo /app/recolector.config.json
