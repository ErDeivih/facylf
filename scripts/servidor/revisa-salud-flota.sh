#!/usr/bin/env bash
# ── ¿ALGUNA FEDERACIÓN ESTÁ EN BUCLE DE CAÍDA? ───────────────────────────────────────────────────────────
#
# Un worker que sale con código distinto de cero y el supervisor lo relanza cada 20 s deja el contenedor
# «arriba» y el monitor contento, pero esa federación NO recolecta nada. Pasó el 23/09/2026 con Valencia: un
# argumento inválido (`--intervalo-min 2`, por debajo del suelo de 4 s que el propio código defiende) la tuvo
# 37 minutos sin hacer una sola petición, y no se veía en `docker ps`.
#
# Este guion busca justo eso: los últimos arranques de cada federación y con qué código terminaron.
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/revisa-salud-flota.sh [líneas_de_registro]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
LINEAS=${1:-400}

echo '════ ¿ALGUNA FEDERACIÓN SALE CON ERROR UNA Y OTRA VEZ? ════'
printf '  %-22s %8s %10s %10s %8s\n' federación arranques "cod!=0" "cod=0" peticiones

for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}
  fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac

  trozo=$(tail -n "$LINEAS" "$f" 2>/dev/null)
  arranques=$(printf '%s' "$trozo" | grep -c 'Arrancando o reanudando la ingesta')
  mal=$(printf '%s' "$trozo" | grep -c 'El worker termino con codigo [1-9]')
  bien=$(printf '%s' "$trozo" | grep -c 'El worker termino con codigo 0')
  # Cuántas peticiones ha hecho: es lo único que demuestra que está trabajando de verdad.
  pet=$(printf '%s' "$trozo" | grep -c '^→ ')

  estado=''
  if [ "$mal" -ge 3 ]; then estado='  ← BUCLE DE CAÍDA'; fi
  if [ "$pet" -eq 0 ] && [ "$arranques" -gt 0 ]; then estado="$estado  ← ARRANCA Y NO PIDE NADA"; fi
  printf '  %-22s %8s %10s %10s %8s%s\n' "$fed" "$arranques" "$mal" "$bien" "$pet" "$estado"
done

echo
echo '── último error de cada federación que haya fallado ──'
for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}; fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac
  if tail -n "$LINEAS" "$f" | grep -q 'El worker termino con codigo [1-9]'; then
    echo "  ── $fed ──"
    tail -n "$LINEAS" "$f" | grep -E 'Error|error:' | tail -2 | sed 's/^/    /'
  fi
done
