#!/usr/bin/env bash
# ¿Quién está lanzando órdenes de docker sin parar? Encuentra los procesos del cliente `docker` y su PADRE, que
# es lo que dice de dónde sale el bucle.
#
# Contexto: el 23/09/2026 la carga llegó a 227 sobre 4 núcleos y los hilos que estaban ejecutando NO eran Chrome
# ni los recolectores, sino `containerd-shim` y `docker`. Eso significa que alguien está creando o consultando
# contenedores en bucle, y eso se come la máquina sin recolectar una página más.
#
# SÓLO LEE.
set -uo pipefail

echo '── procesos del cliente docker: cuántos y de quién ──'
total=$(pgrep -c -x docker 2>/dev/null || echo 0)
echo "  procesos «docker» vivos: $total"
echo
echo '  padre (PPID)  veces   qué es el padre'
ps -eo ppid,comm --no-headers 2>/dev/null | awk '$2 == "docker" { print $1 }' \
  | sort | uniq -c | sort -rn | head -8 | while read -r veces ppid; do
      que=$(ps -o args= -p "$ppid" 2>/dev/null | cut -c1-90)
      printf '  %-13s %-7s %s\n' "$ppid" "$veces" "${que:-(ya no existe)}"
    done
echo
echo '── las órdenes de docker que están en marcha (las 10 primeras) ──'
ps -eo args --no-headers 2>/dev/null | grep -E '^docker ' | cut -c1-110 | sort | uniq -c | sort -rn | head -10 | sed 's/^/  /'
echo
echo '── y los scripts nuestros que sigan corriendo ──'
pgrep -af 'scripts/servidor|mueve-cola|recupera-migracion|para-' 2>/dev/null | grep -v 'pgrep' | head -10 | sed 's/^/  /' || echo '  ninguno'
echo
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg) · hilos ejecutando: $(ps -eLo stat --no-headers 2>/dev/null | grep -c '^R')"
echo '  Si hay muchas órdenes de docker iguales, ése es el bucle: se corta matando a su PADRE, no a docker.'
