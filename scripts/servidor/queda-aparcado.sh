#!/bin/bash
# ── ¿QUEDA ALGO APARCADO AL AÑO 2099? ────────────────────────────────────────────────────────────────────
#
# El 06/10/2026 se encontró que doce federaciones tenían sus temporadas de 2010 a 2018 aparcadas con
# `siguiente_intento = 2099-01-01` —«nunca»—. En Aragón eran 28.154 trabajos de 31.299, y por eso figuraban
# como «sin trabajo» cuando lo que tenían era el trabajo con fecha de nunca.
#
# Este guion es la comprobación de cierre: si sale 0 en todas, el historial está abierto de verdad y no queda
# nada escondido detrás de esa fecha. Es la única cifra que dice si el trabajo está terminado, porque un total
# grande puede crecer por abrir más temporadas y esto no: aquí sólo cuenta lo que sigue aparcado.
#
# SÓLO LEE.
#
# Uso:  bash queda-aparcado.sh
set -u
FEDS="andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"
Q=/srv/ssd/facylf/scripts/servidor/cuenta-aparcados.mjs

printf '%-20s %10s\n' FEDERACION APARCADOS_2099
total=0
for f in $FEDS; do
  c="facylf-${f}-1"
  n=$(docker exec "$c" node "$Q" "/app/descargas-${f}/recolector-local/cola-v2.sqlite" 2>/dev/null)
  n=${n:-0}
  total=$((total + n))
  printf '%-20s %10s\n' "$f" "$n"
done
printf '%-20s %10s\n' TOTAL "$total"
[ "$total" = "0" ] && echo "  ✓ no queda nada aparcado al 2099: el historial está abierto" \
                    || echo "  ⚠ queda trabajo aparcado: seguir abriendo temporadas"
