#!/bin/bash
# ¿Por qué faltan actas en Euskadi, Canarias, La Rioja y Navarra?
#
# Un 31-45 % de los partidos jugados de esas federaciones no tienen referencia de acta. Antes de darlo por
# fallo, se lee el motivo que el recolector guardó al cancelar: si dice que la fuente no publica, es la cuarta
# vez que «parece roto» y es «no hay nada que recoger».
#
# SÓLO LEE.
set -u
S=/srv/ssd/facylf/scripts/por-que-cancelados.mjs
for f in euskadi rioja canarias navarra; do
  for t in 21 20; do
    echo "===== ${f} · temporada ${t}"
    docker exec "facylf-${f}-1" node "$S" "/app/descargas-${f}/recolector-local/cola-v2.sqlite" "$t" 2>&1 | head -10 | sed 's/^/  /'
  done
done
