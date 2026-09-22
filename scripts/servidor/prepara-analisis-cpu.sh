#!/usr/bin/env bash
# Prepara el análisis de CPU: saca la ventana del muestreo y exporta los inicios de petición de esa ventana.
#
# La ventana es la que cubren las muestras (de la primera a la última época), no «la última hora»: para cruzar
# procesador y peticiones, las dos series tienen que hablar EXACTAMENTE del mismo intervalo.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
MUESTRAS="$RAIZ/estado/cpu-muestras.csv"
SALIDA="$RAIZ/estado/peticiones-ventana.csv"

[ -f "$MUESTRAS" ] || { echo "no existe $MUESTRAS"; exit 1; }

PRIMERA=$(tail -n +2 "$MUESTRAS" | cut -d, -f1 | sort -un | head -1)
ULTIMA=$(tail -n +2 "$MUESTRAS" | cut -d, -f1 | sort -un | tail -1)
DESDE=$(date -u -d "@$PRIMERA" +%Y-%m-%dT%H:%M:%S.000Z)
HASTA=$(date -u -d "@$((ULTIMA + 1))" +%Y-%m-%dT%H:%M:%S.000Z)

echo "ventana del muestreo: $DESDE → $HASTA"
echo "muestras: $(tail -n +2 "$MUESTRAS" | cut -d, -f1 | sort -u | wc -l) · contenedores: $(tail -n +2 "$MUESTRAS" | cut -d, -f2 | sort -u | wc -l)"

docker run --rm -v "$RAIZ:/app" --entrypoint node facylf-recolectores:local \
  /app/scripts/servidor/exporta-peticiones.mjs "$DESDE" "$HASTA" > "$SALIDA"

echo "peticiones exportadas: $(wc -l < "$SALIDA") → $SALIDA"
cut -d, -f1 "$SALIDA" | sort | uniq -c | sort -rn | head -20
