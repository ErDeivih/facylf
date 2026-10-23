#!/bin/bash
# ── T-03 (2ª parte) · REABRIR lo cancelado por fallos de red, CON --aplicar ────────────────────────────────
#
# El propio script dice que se puede lanzar «con el recolector parado **o entre tandas**» (la cola usa WAL y
# espera hasta 2 min por el bloqueo), así que NO hay que parar ningún contenedor: se aplica y se vuelve a contar.
#
# Sólo toca filas concretas (`where clave=? and estado='cancelado'`), no hace barridos.
set -u
FEDS="aragon asturias baleares cantabria castilla-la-mancha extremadura federacion galicia melilla murcia navarra"
total_antes=0; total_despues=0
for f in $FEDS; do
  cola="/app/descargas-$f/recolector-local/cola-v2.sqlite"
  antes=$(docker exec "facylf-$f-1" node --no-warnings /app/scripts/claude/reabre-cancelados-por-red.mjs "$cola" 2>&1 | grep -oE '[0-9]+ trabajos' | grep -oE '^[0-9]+')
  [ -z "$antes" ] && antes=0
  if [ "$antes" -gt 0 ]; then
    docker exec "facylf-$f-1" node --no-warnings /app/scripts/claude/reabre-cancelados-por-red.mjs "$cola" --aplicar >/dev/null 2>&1
  fi
  despues=$(docker exec "facylf-$f-1" node --no-warnings /app/scripts/claude/reabre-cancelados-por-red.mjs "$cola" 2>&1 | grep -oE '[0-9]+ trabajos' | grep -oE '^[0-9]+')
  [ -z "$despues" ] && despues=0
  total_antes=$((total_antes + antes)); total_despues=$((total_despues + despues))
  printf '  %-20s antes %3s → después %3s  %s\n' "$f" "$antes" "$despues" "$([ "$despues" -eq 0 ] && echo 'OK' || echo 'quedan')"
done
echo "  ────────────────────────────────────────"
echo "  SERVIDOR: $total_antes antes → $total_despues después"
