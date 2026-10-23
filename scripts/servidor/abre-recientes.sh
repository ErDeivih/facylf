#!/bin/bash
# ── ABRIR LA TEMPORADA MÁS RECIENTE QUE ESTÉ APARCADA, EN TODAS LAS FEDERACIONES ─────────────────────────
#
# Medido el 06/10/2026: doce federaciones del servidor tenían sus temporadas de 2010 a 2018 aparcadas con
# `siguiente_intento = 2099-01-01` —«nunca»—. En Aragón eran 28.154 trabajos de 31.299. No las aparcó un
# fallo (no llevan ni un error): las aparcó una decisión.
#
# David lo quiere abrir, y con razón: con quince temporadas de historial detrás, una federación no puede estar
# «sin trabajo». Pero NO se abre todo de golpe —eso ahogaría a los recolectores y volvería a tapar la
# temporada en curso—, sino **una temporada por federación**, la más reciente que falte, y se mide.
#
# El orden importa: primero lo reciente y luego hacia atrás, como pidió. Así lo que se recupera primero es lo
# que da «temporadas anteriores» para los jugadores de hoy.
#
# Uso:  bash abre-recientes.sh [--aplicar]
set -u
APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
S=/srv/ssd/facylf/scripts/servidor/abre-temporada.mjs

for f in $FEDS; do
  c="facylf-${f}-1"
  cola="/app/descargas-${f}/recolector-local/cola-v2.sqlite"
  asig="/app/descargas-${f}/recolector-local/temporadas-asignadas.txt"
  [ "$APLICAR" = "1" ] || { echo "  ${f}: (mirar)"; continue; }

  # La temporada más reciente aparcada. Va en un FICHERO y no en un `node -e` en línea: este proyecto ya tiene
  # documentado que PowerShell 5.1 no escapa las comillas al pasar argumentos a un ejecutable nativo, y el
  # JavaScript llega roto y falla EN SILENCIO. Pasó aquí mismo el 06/10/2026: las dieciséis federaciones
  # contestaron «no tiene nada aparcado» con 27.381 trabajos aparcados en Aragón.
  t=$(docker exec "$c" node /srv/ssd/facylf/scripts/servidor/temporada-aparcada-mas-reciente.mjs "$cola" 2>/dev/null | cut -d' ' -f1)

  if [ -z "$t" ]; then echo "  ${f}: no tiene nada aparcado"; continue; fi
  docker exec "$c" node "$S" "$cola" "$t" --abrir --asignadas "$asig" 2>&1 | grep -E 'ABIERTA|no hay nada|añadida' | sed "s/^/  ${f} (t${t}): /"
done

[ "$APLICAR" = "1" ] || { echo; echo "  (MIRAR: no se ha abierto nada. Repetir con --aplicar)"; }
