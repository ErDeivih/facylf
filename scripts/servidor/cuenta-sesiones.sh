#!/usr/bin/env bash
# ¿Cuántas veces arranca sesión cada recolector en la última hora? Se cuenta por MARCA DE TIEMPO del registro,
# no por trozos de fichero (contar coincidencias en los últimos 200 KB no dice en cuánto tiempo ocurrieron).
set -uo pipefail
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
MINUTOS=${1:-60}
DESDE=$(date -d "-${MINUTOS} minutes" '+%Y-%m-%d %H:%M:%S')
FEDERACIONES=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna ceuta euskadi \
  extremadura federacion galicia madrid melilla murcia navarra rioja valencia)

printf '%-22s %10s %12s %12s %12s\n' federación arranques esperas_plaza paradas codigo_1
for f in "${FEDERACIONES[@]}"; do
  registro="$RAIZ/descargas-$f/recolector-local/worker-programado.log"
  [ -f "$registro" ] || { printf '%-22s %10s\n' "$f" 'sin registro'; continue; }
  # Las líneas del lanzador llevan marca de tiempo al principio; se compara en texto (formato ISO local).
  arranques=$(awk -v d="$DESDE" 'substr($0,1,19) >= d' "$registro" | grep -c 'Arrancando o reanudando' || true)
  plazas=$(awk -v d="$DESDE" 'substr($0,1,19) >= d' "$registro" | grep -cE 'esperando para abrir Chrome|no cabe por reparto' || true)
  paradas=$(awk -v d="$DESDE" 'substr($0,1,19) >= d' "$registro" | grep -c 'Contenedor parado' || true)
  errores=$(awk -v d="$DESDE" 'substr($0,1,19) >= d' "$registro" | grep -cE 'codigo 1|código 1' || true)
  printf '%-22s %10s %12s %12s %12s\n' "$f" "$arranques" "$plazas" "$paradas" "$errores"
done
echo
echo "ventana: desde $DESDE · (arranques = veces que el worker empieza una sesión nueva)"
