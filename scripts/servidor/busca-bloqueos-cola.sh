#!/usr/bin/env bash
# ── ¿LOS RECOLECTORES ESPERAN POR LA COLA? ───────────────────────────────────────────────────────────────
#
# El importador mantiene abierta la cola de cada federación mientras importa una unidad (hasta tres minutos por
# unidad, medido). Los recolectores abren esa misma cola con `busy_timeout = 120000`, así que si el importador
# tiene el bloqueo, el recolector ESPERA — y esa espera se paga en cada trabajo, sin gastar procesador y sin
# generar ninguna petición. Es exactamente la forma del hueco de ~9 s por trabajo que no se explicaba.
#
# Este guion busca las huellas de esa espera en los registros: bloqueos, errores de SQLite y cuántas pausas
# respetuosas se ven. SÓLO LEE.
#
# Uso: bash scripts/servidor/busca-bloqueos-cola.sh
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '════ ¿HAY ESPERA POR LA COLA? (registros de los recolectores) ════'
printf '  %-22s %8s %8s %8s %10s\n' federación bloqueos busy errores "pausas_1s"

for f in "$RAIZ"/descargas-*/recolector-local/worker-programado.log; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}
  fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac
  # `grep -c` imprime «0» y ADEMÁS sale con código 1 cuando no encuentra nada, así que un `|| echo 0` añadía un
  # segundo cero y la tabla salía partida en dos líneas. Se recoge sólo lo que imprime.
  bloqueos=$(grep -c -i 'database is locked\|database table is locked' "$f" 2>/dev/null); bloqueos=${bloqueos:-0}
  busy=$(grep -c -i 'SQLITE_BUSY\|busy_timeout' "$f" 2>/dev/null); busy=${busy:-0}
  errores=$(grep -c -i 'ERR_SQLITE_ERROR' "$f" 2>/dev/null); errores=${errores:-0}
  # La pausa de 1 s es el caso en que el trabajo ya ha durado casi toda la cortesía: si abundan, el trabajo
  # local manda sobre la cortesía.
  pausas=$(grep -c 'pausa respetuosa de 1 s' "$f" 2>/dev/null); pausas=${pausas:-0}
  printf '  %-22s %8s %8s %8s %10s\n' "$fed" "$bloqueos" "$busy" "$errores" "$pausas"
done

echo
echo '── ¿cuántas veces el registro dice que esperó a que el otro terminara? ──'
grep -h -i -o 'database is locked' "$RAIZ"/descargas-*/recolector-local/worker-programado.log 2>/dev/null \
  | wc -l | sed 's/^/  coincidencias totales: /'

echo
echo '── las últimas líneas del importador que hablen de bloqueos o unidades ──'
if [ -f "$RAIZ/estado/importacion.log" ]; then
  tail -40 "$RAIZ/estado/importacion.log" | sed 's/^/  /'
else
  echo '  (sin estado/importacion.log)'
fi
