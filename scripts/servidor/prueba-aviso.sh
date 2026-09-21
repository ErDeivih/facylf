#!/usr/bin/env bash
# Prueba de que los avisos llegan: manda un mensaje al tema `facylf` de ntfy.
# Va como guion porque PowerShell se come las comillas al pasar por ssh y `curl` con banderas acaba pidiendo
# URLs que no existen.
set -uo pipefail

echo "── ntfy (tema facylf) ──"
curl -sS -m 10 \
  -H 'Title: facylf: prueba de avisos' \
  -H 'Priority: default' \
  -H 'Tags: white_check_mark' \
  -d 'Monitor y alertas funcionando en el servidor. Este es el canal que usaran los avisos de la flota.' \
  http://127.0.0.1:8085/facylf && echo "  aviso enviado (si estas suscrito al tema facylf, te habra llegado)"

echo "── contenedores de facylf ──"
docker ps --filter name=facylf --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "── estado guardado por el monitor ──"
for f in estado/facylf.json estado/importacion-resumen.json estado/canonico.txt; do
  if [ -f "/srv/data/facylf/$f" ]; then
    echo "  $f: $(wc -c < "/srv/data/facylf/$f") bytes"
  fi
done

echo "── copia de datos ──"
du -sh /srv/data/facylf | awk '{print "  copiado: " $1}'
echo -n "  federaciones completas: "
ls -1 /srv/data/facylf/.copiado-* 2>/dev/null | sed 's|.*copiado-||' | tr '\n' ' '
echo
echo -n "  en curso: "
ls -1d /srv/data/facylf/descargas-* 2>/dev/null | sed 's|.*descargas-||' | tr '\n' ' '
echo

echo "── disco ──"
df -h / | tail -1 | awk '{print "  libre: " $4 " (" $5 " usado)"}'
