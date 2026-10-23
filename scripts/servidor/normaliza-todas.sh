#!/bin/bash
# Normaliza los ficheros de temporadas asignadas de las 16 federaciones del servidor: códigos → etiquetas.
#
# `abre-temporada.mjs` escribió CÓDIGOS durante las rondas del 06/10/2026, y `lib/temporadas-asignadas.mjs` lee
# ETIQUETAS —y avisa de que un código suelto filtra por la temporada equivocada SIN dar ningún aviso, porque el
# código no significa lo mismo en cada federación. Medido: Madrid y Valencia quedaron con `18 17 16 15 14 13 12
# 11`, que el lector no reconoce, así que la asignación no valía para nada.
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
S=/srv/ssd/facylf/scripts/servidor/normaliza-asignadas.mjs
for f in $FEDS; do
  echo "--- ${f}"
  docker exec "facylf-${f}-1" node "$S" "/app/descargas-${f}/recolector-local/cola-v2.sqlite" --escribir 2>&1 \
    | grep -E 'antes|después|escrito|conoce' | sed 's/^/    /'
done
