#!/bin/bash
# ¿Las federaciones que no han pedido nada están atascadas o simplemente no les toca?
#
# Medido el 08/10/2026: canarias, cantabria, ceuta y melilla llevaban una hora sin una sola petición, mientras
# las otras 12 del servidor iban a 2.810/hora entre todas.
#
#   · «no les toca»  → todos sus pendientes tienen fecha futura. NORMAL (como Cataluña, que tiene 909).
#   · «atascadas»    → tienen trabajo vencido y sin hacer. PROBLEMA.
#
# Los recolectores escriben en `worker-programado.log` DENTRO del contenedor, no en la salida de docker,
# así que `docker logs` sale vacío y no dice nada. Aquí se mira el fichero de verdad.
#
# SÓLO LEE.
set -u
for f in "$@"; do
  echo "════════ ${f}"
  echo -n "  estado del contenedor: "
  docker inspect -f '{{.State.Status}} (desde {{.State.StartedAt}})' "facylf-${f}-1" 2>&1 | cut -c1-60
  echo "  --- su registro interno, lo último ---"
  docker exec "facylf-${f}-1" sh -c 'tail -3 /app/descargas-'"$f"'/recolector-local/worker-programado.log 2>/dev/null || echo "(sin registro)"' 2>&1 | sed 's/^/    /' | cut -c1-150
  echo "  --- ¿tiene trabajo vencido? ---"
  docker exec "facylf-${f}-1" node -e "
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync('/app/descargas-${f}/recolector-local/cola-v2.sqlite', { readOnly: true });
    const ahora = new Date().toISOString();
    const vencidos = db.prepare(\"select count(*) n from trabajos where estado='pendiente' and siguiente_intento <= ?\").get(ahora).n;
    const total = db.prepare(\"select count(*) n from trabajos where estado='pendiente'\").get().n;
    const prox = db.prepare(\"select min(siguiente_intento) a from trabajos where estado='pendiente'\").get().a;
    console.log('    pendientes: ' + total + ' · VENCIDOS AHORA: ' + vencidos + ' · el proximo toca: ' + String(prox).slice(0,16));
    db.close();
  " 2>&1 | tail -2
done
