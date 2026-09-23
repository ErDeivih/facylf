#!/usr/bin/env bash
# ¿Qué está haciendo el importador? Procesos con su CPU, su estado y sus últimas líneas.
set -uo pipefail
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo "── contenedor ──"
docker ps --filter name=facylf-importador --format '{{.Names}} · {{.Status}} · {{.Image}}'
echo
echo "── procesos dentro (CPU acumulada y estado) ──"
docker top facylf-importador 2>&1 | head -20
echo
echo "── ficheros de estado del lanzador ──"
ls -la "$RAIZ"/estado/ 2>/dev/null | sed 's/^/  /'
for f in "$RAIZ"/estado/importacion*.json "$RAIZ"/estado/importacion*.log; do
  [ -f "$f" ] || continue
  echo "  ── $f (tamaño $(stat -c %s "$f"), escrito $(stat -c %y "$f" | cut -c1-19)) ──"
  tail -5 "$f" | sed 's/^/    /'
done
echo
echo "── últimas líneas de salida del contenedor ──"
docker logs --tail 15 facylf-importador 2>&1 | tail -15 | sed 's/^/  /'
echo
echo "── puntos de montaje ──"
docker inspect facylf-importador --format '{{range .Mounts}}  {{.Source}} -> {{.Destination}}
{{end}}' 2>&1 | head -25
