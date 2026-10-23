#!/usr/bin/env bash
# verifica-web-ocultas.sh — ¿se pueden consultar en la web las tres federaciones que recoge el PC?
#
# ── POR QUÉ HACE FALTA UNA FOTO DE ANTES ─────────────────────────────────────────────────────────────────
#
# Un «cero apariciones» no prueba nada por sí solo: si la web no respondiera, o si la página viniera vacía, el
# recuento también sería cero y parecería que el filtro funciona. Por eso este guion mide DOS cosas en cada
# página: que aparezcan las tres que deben estar FUERA, y que aparezca una que debe seguir DENTRO (Andalucía)
# como control. Si el control sale cero, la medida no vale y se dice, en vez de dar el trabajo por bueno.
#
# Se miran las cuatro páginas que leen el canónico, porque son las que podrían enseñarlas: la portada (recuentos
# y federaciones), /federaciones, /competiciones (listado de grupos) y /canonico (cobertura por federación).
#
# SÓLO LEE: se trae el HTML y lo cuenta.
#
# Uso:  bash scripts/servidor/verifica-web-ocultas.sh [etiqueta]
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

ETIQUETA="${1:-medicion}"
DESTINO="/tmp/web-ocultas-${ETIQUETA}"

echo "══ ¿Se pueden consultar Valencia, Madrid y Cataluña en la web? · ${ETIQUETA} · $(date -Is) ══"
rm -rf "$DESTINO"
bash scripts/servidor/trae-paginas-web.sh "$DESTINO" >/dev/null 2>&1 || true

# ── DOS TRAMPAS DE MEDICIÓN QUE YA ME MORDIERON (24/09/2026) ───────────────────────────────────────────────
#
# 1. LOS ACENTOS. El HTML guarda «Andalucía» como `Andaluc&#237;a`, así que un `grep 'Andalucía'` no encuentra
#    nada aunque el nombre esté en la página. Por eso se buscan fragmentos SIN acentos (`Catalu`, `Valenciana`):
#    coinciden tanto si el nombre va en UTF-8 como si va en entidades.
#
# 2. EL CONTROL TIENE QUE APARECER DE VERDAD. Se puso «Andalucía» de control y salía 0 en las cuatro páginas
#    —medido—, porque la portada y /federaciones solo nombran las federaciones QUE TIENEN DATOS importados, y
#    Andalucía no está entre ellas. Con un control que nunca aparece, un cero no prueba nada. Los que sí
#    aparecen, medidos: Murcia y Navarra (2 veces en la portada, 4 en /federaciones). Esos son el control.
#
# Y se busca «Comunidad de Madrid», no «Madrid» a secas: en otras páginas «Madrid» también es el nombre de un
# club, y contar clubes no dice nada sobre la federación.
FUERA=('Comunidad Valenciana' 'Comunidad de Madrid' 'Catalu')
CONTROLES=('Murcia' 'Navarra')
total_fuera=0
total_control=0
problemas=0

printf '%-16s %9s %9s %7s %8s %9s\n' PAGINA BYTES VALENCIANA MADRID CATALU CONTROL
for pagina in portada federaciones competiciones canonico; do
  fichero="${DESTINO}/${pagina}.html"
  if [ ! -f "$fichero" ]; then
    printf '%-16s %9s  no se pudo traer\n' "$pagina" '-'
    problemas=$((problemas + 1))
    continue
  fi
  bytes=$(wc -c < "$fichero")
  v=$(grep -o 'Comunidad Valenciana' "$fichero" 2>/dev/null | wc -l)
  m=$(grep -o 'Comunidad de Madrid' "$fichero" 2>/dev/null | wc -l)
  c=$(grep -o 'Catalu' "$fichero" 2>/dev/null | wc -l)
  ctrl=0
  for nombre in "${CONTROLES[@]}"; do
    n=$(grep -o "$nombre" "$fichero" 2>/dev/null | wc -l)
    ctrl=$((ctrl + n))
  done
  total_fuera=$((total_fuera + v + m + c))
  total_control=$((total_control + ctrl))
  printf '%-16s %9s %9s %7s %8s %9s\n' "$pagina" "$bytes" "$v" "$m" "$c" "$ctrl"
done

echo
echo "── veredicto ──"
if [ "$total_control" = "0" ]; then
  echo "  LA MEDICIÓN NO VALE: el control (${CONTROLES[*]}) no aparece en ninguna página."
  echo "  Sin un nombre que sí deba aparecer, un cero no prueba que las otras estén fuera."
  problemas=$((problemas + 1))
fi
if [ "$total_fuera" = "0" ] && [ "$total_control" != "0" ]; then
  echo "  CORRECTO: Valencia, Madrid y Cataluña dan 0 apariciones y el control aparece ${total_control} veces,"
  echo "  así que la web está leyendo de verdad y las tres ya no se pueden consultar."
elif [ "$total_fuera" != "0" ]; then
  echo "  TODAVÍA SE PUEDEN CONSULTAR: ${total_fuera} apariciones de las tres en total."
  echo "  Es lo esperado mientras la imagen de la web no se haya reconstruido y desplegado."
fi
exit $(( problemas > 0 ? 1 : 0 ))
