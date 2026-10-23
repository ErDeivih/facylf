#!/bin/bash
# ¿Las temporadas que faltan en Canarias, Ceuta, Melilla y Murcia se buscaron y la fuente no las tenía?
#
# Aprendido con Cataluña (08/10/2026): su historial no estaba sin descubrir — **la API de la FCF sólo publica
# dos temporadas** (`https://www.fcf.cat/api/competition/temporadas` devuelve 22 y 21, y nada más). Es decir, un
# hueco en el catálogo puede ser un fallo NUESTRO o simplemente lo que la fuente ofrece.
#
# La forma de distinguirlo sin navegador: mirar el estado de los trabajos de cada temporada en la cola. Si las
# temporadas que faltan aparecen **canceladas**, es que el descubrimiento las buscó y la fuente no dio nada.
#
# SÓLO LEE.
set -u
for f in canarias ceuta melilla murcia; do
  echo "════════ ${f}"
  docker exec "facylf-${f}-1" node /srv/ssd/facylf/scripts/diagnostica-trabajo-cola.mjs \
    "/app/descargas-${f}/recolector-local/cola-v2.sqlite" "$f" 2>/dev/null \
    | grep -o '"temporadas":\[[^]]*\]' | sed 's/.*\[//;s/\]//' | tr ',' '\n' | sed 's/"//g;s/^/  /'
  echo "  --- motivos de cancelación de trabajos de catálogo/temporada ---"
  docker exec "facylf-${f}-1" node /srv/ssd/facylf/scripts/por-que-cancelados.mjs \
    "/app/descargas-${f}/recolector-local/cola-v2.sqlite" 22 2>/dev/null | head -6 | sed 's/^/  /'
done
