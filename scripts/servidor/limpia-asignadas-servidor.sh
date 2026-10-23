#!/bin/bash
# ── DESHACER EL DAÑO DEL FICHERO DE TEMPORADAS ASIGNADAS (06/10/2026) ────────────────────────────────────
#
# `temporadas-asignadas.txt` NO AÑADE TEMPORADAS: **RESTRINGE la recolección a las que lista.**
#
#   lib/recolector-local.mjs:831
#     const conAsignacion = hayTemporadasAsignadas();
#       ? sqlSoloTemporadasAsignadas('trabajos')   ← la selección de trabajo queda LIMITADA a esas temporadas
#   lib/recolector-local.mjs:1645  (igual, para las actas)
#
# Y está pensado para UNA sola cosa, que la propia librería explica: repartir Castilla y León entre el PC y el
# servidor por temporadas completas, para que las dos máquinas no pidan las mismas actas. «En el PC conviven
# cuatro federaciones y SÓLO UNA se reparte por temporadas.»
#
# Al desaparcar el historial creé ese fichero en catorce federaciones del servidor que NO lo tenían. Efecto
# medido: cada una quedaba restringida a ocho o nueve temporadas antiguas **y dejaba de recoger la temporada en
# curso** — justo lo contrario de lo que hacía falta, y sin ningún error que lo dijera.
#
# Esto lo deshace: quita el fichero a las que no deben tenerlo y deja a `federacion` (Castilla y León) con su
# reparto original de seis temporadas. El trabajo desaparcado NO se toca: sigue pendiente en la cola.
#
# Uso:  bash limpia-asignadas-servidor.sh [--aplicar]
set -u
APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

echo "federaciones que NO deben tener reparto (se les quita el fichero):"
for f in $FEDS; do
  [ "$f" = "federacion" ] && continue
  ruta="/srv/data/facylf/descargas-${f}/recolector-local/temporadas-asignadas.txt"
  if [ -f "$ruta" ]; then
    if [ "$APLICAR" = "1" ]; then rm -f "$ruta"; echo "  ${f}: eliminado"; else echo "  ${f}: existe (se eliminaría)"; fi
  else
    echo "  ${f}: no lo tiene"
  fi
done

echo
echo "federacion (Castilla y León): reparto ORIGINAL de seis temporadas"
ruta="/srv/data/facylf/descargas-federacion/recolector-local/temporadas-asignadas.txt"
if [ "$APLICAR" = "1" ]; then
  printf '2026-27\n2024-25\n2022-23\n2020-21\n2018-19\n2016-17\n' > "$ruta"
  echo "  restaurado: $(tr '\n' ' ' < "$ruta")"
else
  echo "  ahora: $(grep -v '^ *#' "$ruta" 2>/dev/null | tr '\n' ' ')"
fi

[ "$APLICAR" = "1" ] || { echo; echo "  (MIRAR: repetir con --aplicar)"; }
