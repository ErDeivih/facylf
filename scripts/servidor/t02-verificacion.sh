#!/bin/bash
# ── T-02 · PASO 2 del encargo del 11/10: verificar el despliegue ───────────────────────────────────────────
#
# Los cinco controles, con su número. SÓLO LEE: no cambia nada.
#   1. La temporada en curso va primero (prioridad mínima vencida negativa o null).
#   2. Entran las temporadas históricas nuevas (ya visto en T-01; se reconfirma).
#   3. El monitor cuenta bien (Rioja y las demás «trabajando», Andalucía fuera).
#   4. Cataluña quieta (se comprueba en el PC, no aquí).
#   5. El ritmo no baja (referencia: 4.500–7.400 peticiones/24 h por federación activa).
set -u
F="aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

echo "===== 1 · ¿la temporada en curso va primero? ====="
for fed in galicia federacion aragon; do
  echo "  --- $fed ---"
  docker exec "facylf-$fed-1" node --no-warnings /app/scripts/claude/que-sirve.mjs \
    "/app/descargas-$fed/recolector-local/cola-v2.sqlite" 1 2>&1 | head -12 | sed 's/^/    /'
done

echo "===== 2 · temporadas históricas nuevas (reconfirmación) ====="
docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings \
  /app/scripts/claude/competiciones-por-temporada.mjs aragon galicia federacion 2>&1 | head -4 | sed 's/^/  /'

echo "===== 3 · el monitor ====="
docker logs --tail 40 facylf-monitor 2>&1 | grep -iE 'trabajando|sin-trabajo|sin trabajo|andalucia|rioja' | tail -14 | sed 's/^/  /'

echo "===== 5 · ritmo de las últimas 24 h por federación ====="
docker exec -e FACYLF_RAIZ=/app facylf-monitor node --no-warnings \
  /app/scripts/claude/ritmo-peticiones.mjs $F 2>&1 | tail -20 | sed 's/^/  /'
