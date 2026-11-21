#!/usr/bin/env bash
# ── LIMPIEZA DE LA AUDITORÍA, POR LOTES ──────────────────────────────────────────────────────────────────
#
# `ops.batch_cambio` guarda cada cambio que hace el importador y llegó a 68 millones de filas (19 GB), más
# de la mitad de la base. El 21/11/2026 intenté vaciarla con un solo DELETE y bloqueó la tabla: el importador
# se quedó esperando y dos navegadores se pararon 12 minutos.
#
# Ahora se borra **por lotes pequeños de 50.000 filas**, con su commit cada uno, y se deja un rato entre
# lotes. Así la tabla nunca queda bloqueada más de un segundo y el importador no se entera.
#
# Se guardan los últimos 3 días: la auditoría sirve para ver qué pasó estos días, no para guardar historia.
set -u

LOG=/var/log/facylf-limpia-auditoria.log
DIAS=3
LOTE=50000
MAX_LOTES=120          # 6 millones de filas por pasada; con las de cada hora basta y sobra
PSQL="docker exec facylf-postgres psql -U facylf_admin -d facylf -At"

apunta() { echo "$(date '+%F %T') $*" >> "$LOG"; }

total=0
for i in $(seq 1 "$MAX_LOTES"); do
  borradas=$($PSQL -c "with t as (
      delete from ops.batch_cambio
       where id in (select id from ops.batch_cambio
                     where registrado_en < now() - interval '${DIAS} days'
                     limit ${LOTE})
      returning 1) select count(*) from t" 2>/dev/null | tr -d '[:space:]')
  [ -z "$borradas" ] && { apunta "no se pudo borrar el lote $i"; break; }
  total=$(( total + borradas ))
  [ "$borradas" -lt "$LOTE" ] && break
  sleep 1
done

apunta "borradas ${total} filas con más de ${DIAS} días"
echo "$total"
