#!/usr/bin/env bash
# ── QUIÉN TIENE PLAZA DE NAVEGADOR Y QUIÉN ESPERA ───────────────────────────────────────────────────────
#
# El reparto de plazas vive en el volumen `plazas` (`/app/.estado-workers/slots-chrome`), compartido por todos
# los contenedores. Dentro hay dos clases de ficha:
#
#   · `slot-N.lock`  — plaza OCUPADA. El número de ficheros `slot-*` no puede pasar del presupuesto
#                      (`FACYLF_MEMORIA_GB`): con 5 GB son 4 plazas.
#   · `espera-*.lock` — federación ESPERANDO plaza. Su orden lo fija la hora de llegada.
#
# Esto lo enseña tal cual, que es lo que permite responder a «¿cuántas federaciones están pidiendo de verdad?».
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
ENV="$RAIZ/docker/.env"
memoria=$(grep -E '^FACYLF_MEMORIA_GB=' "$ENV" 2>/dev/null | cut -d= -f2); memoria=${memoria:-10}
reserva=$(grep -E '^FACYLF_RESERVA_GB=' "$ENV" 2>/dev/null | cut -d= -f2); reserva=${reserva:-1.5}

cat > /tmp/lee-plazas.sh <<'SH'
for f in /p/slots-chrome/*.lock; do
  [ -f "$f" ] || continue
  echo "$(basename "$f") · $(cat "$f" 2>/dev/null | tr '\n' ' ')"
done
SH

echo "presupuesto: ${memoria} GB − reserva ${reserva} GB"
awk -v m="$memoria" -v r="$reserva" 'BEGIN { printf "  → %d plazas de navegador\n", int((m - r) / 0.75) }'
echo
echo "── fichas vivas en el volumen de plazas ──"
timeout 30 docker run --rm -v facylf_plazas:/p -v /tmp/lee-plazas.sh:/lee.sh:ro alpine sh /lee.sh 2>&1 | sort | sed 's/^/  /'

echo
ocupadas=$(timeout 30 docker run --rm -v facylf_plazas:/p alpine sh -c 'ls /p/slots-chrome/slot-*.lock 2>/dev/null | wc -l' 2>/dev/null || echo '?')
esperando=$(timeout 30 docker run --rm -v facylf_plazas:/p alpine sh -c 'ls /p/slots-chrome/espera-*.lock 2>/dev/null | wc -l' 2>/dev/null || echo '?')
echo "plazas ocupadas: $ocupadas · federaciones esperando: $esperando"
