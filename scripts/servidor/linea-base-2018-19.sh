#!/bin/bash
# ── LÍNEA BASE: SIEMPRE LAS MISMAS FEDERACIONES Y LA MISMA TEMPORADA ─────────────────────────────────────
#
# Sumar «todas las temporadas abiertas» engaña: cada ronda abro más, y las nuevas traen actas hechas de antes,
# así que el total sube por abrir, no por producir. La única medida honesta es **seguir un conjunto fijo en el
# tiempo** y volver a medirlo.
#
# Conjunto fijo: las diez federaciones y la temporada 2018-19 medidas el 06/10/2026 en la ronda 6.
#
#   federación            hechos   actas
#   andalucia              3.323    1.935
#   castilla-la-mancha     2.963    2.222
#   navarra                2.756    2.123
#   ceuta                  2.710    2.005
#   euskadi                2.481    1.879
#   cantabria              2.104    1.611
#   murcia                 1.943    1.555
#   extremadura            1.687    1.216
#   rioja                  1.587      995
#   asturias                 888      598
#   TOTAL                 22.442   15.139
#
# Si al volver a medir sube, el sistema produce. Si no sube, hay que averiguar por qué. SÓLO LEE.
#
# Uso:  bash linea-base-2018-19.sh
set -u
FEDS="andalucia castilla-la-mancha navarra ceuta euskadi cantabria murcia extremadura rioja asturias"
Q=/srv/ssd/facylf/scripts/servidor/progreso-temporada.mjs

printf '%-20s %9s %9s %9s %9s\n' FEDERACION HECHOS PENDIENTE APLAZADO ACTAS
th=0; tp=0; ta=0
for f in $FEDS; do
  c="facylf-${f}-1"
  l=$(docker exec "$c" node "$Q" "/app/descargas-${f}/recolector-local/cola-v2.sqlite" 18 2>/dev/null)
  h=$(echo "$l" | cut -d'|' -f1); p=$(echo "$l" | cut -d'|' -f2); ap=$(echo "$l" | cut -d'|' -f3); a=$(echo "$l" | cut -d'|' -f4)
  th=$((th + ${h:-0})); tp=$((tp + ${p:-0})); ta=$((ta + ${a:-0}))
  printf '%-20s %9s %9s %9s %9s\n' "$f" "${h:-?}" "${p:-?}" "${ap:-?}" "${a:-?}"
done
printf '%-20s %9s %9s %9s %9s\n' TOTAL "$th" "$tp" '-' "$ta"
echo
echo "  ronda 6 (06/10 16:38)  →  hechos 22442   actas 15139"
printf '  ahora                  →  hechos %-8s actas %-8s\n' "$th" "$ta"
echo "  diferencia             →  hechos +$((th - 22442))   actas +$((ta - 15139))"
