#!/usr/bin/env bash
# ── ¿CUÁNTOS SEGUNDOS DE PROCESADOR CUESTA UNA PETICIÓN? ────────────────────────────────────────────────
#
# Ésta es la pregunta que decide la estrategia entera:
#
#   · si una petición cuesta mucho CPU, el techo lo pone LA MÁQUINA y bajar la cortesía no sirve de nada
#     (el recolector ya está trabajando, no esperando), y abrir dos pestañas tampoco: repartiría la misma CPU;
#   · si cuesta poco CPU y el ciclo es largo, el techo lo pone la espera y entonces sí manda la cortesía.
#
# `docker stats` da un porcentaje instantáneo y engaña. Aquí se mide lo de verdad: el INCREMENTO de
# `cpu.stat` del cgroup de cada contenedor (microsegundos de procesador consumidos) durante una ventana, y se
# divide entre las peticiones que esa federación ha hecho EN ESA MISMA VENTANA, contadas en su cola.
#
# SÓLO LECTURA: no cambia cuotas, no reinicia contenedores, sólo lee /sys/fs/cgroup y abre las colas en modo
# lectura.
#
# Uso: bash scripts/servidor/mide-cpu-por-peticion.sh [segundos_de_ventana]
set -uo pipefail

VENTANA=${1:-60}
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
IMAGEN=facylf-recolectores:local

echo "midiendo $VENTANA s de CPU real por contenedor…"
T0=$(date +%s)
declare -A U0
for c in $(docker ps --filter 'name=facylf' --format '{{.Names}}' | sort); do
  u=$(cat "/sys/fs/cgroup$(awk -F: '/^0::/ { print $3 }' /proc/$(docker inspect -f '{{.State.Pid}}' "$c")/cgroup)/cpu.stat" 2>/dev/null \
      | awk '/^usage_usec/ { print $2 }')
  U0[$c]=${u:-0}
done

sleep "$VENTANA"

DESDE=$(date -u -d "@$T0" +%Y-%m-%dT%H:%M:%S.000Z)
HASTA=$(date -u -d "@$(date +%s)" +%Y-%m-%dT%H:%M:%S.000Z)

# Las peticiones se cuentan en las colas: el host no tiene Node, así que se hace dentro del contenedor.
PET=$(docker run --rm -v "$RAIZ:/app" --entrypoint node "$IMAGEN" \
  /app/scripts/servidor/cuenta-peticiones-ventana.mjs "$DESDE" "$HASTA" 2>/dev/null)

echo
echo '════════ ¿EN QUÉ SE VA EL PROCESADOR DE CADA RECOLECTOR? ════════'
echo '  contenedor                     cuota   peticiones   cpu-s total   cpu-s/petición'
printf '%s\n' "$PET" | while IFS=$'\t' read -r fed n; do
  [ -z "$fed" ] && continue
  c="facylf-${fed}-1"
  pid=$(docker inspect -f '{{.State.Pid}}' "$c" 2>/dev/null)
  [ -z "$pid" ] && continue
  cg="/sys/fs/cgroup$(awk -F: '/^0::/ { print $3 }' /proc/$pid/cgroup 2>/dev/null)"
  u2=$(awk '/^usage_usec/ { print $2 }' "$cg/cpu.stat" 2>/dev/null)
  [ -z "$u2" ] && continue
  cuota=$(awk '{ if ($1 == "max") print "sin tope"; else printf "%.2f", $1 / $2 }' "$cg/cpu.max" 2>/dev/null)
  cpu_s=$(awk -v a="${U0[$c]:-0}" -v b="$u2" 'BEGIN { printf "%.1f", (b - a) / 1000000 }')
  por=$(awk -v s="$cpu_s" -v n="$n" 'BEGIN { if (n + 0 > 0) printf "%.2f", s / n; else printf "—" }')
  printf '  %-30s %-7s %-12s %-13s %s\n' "$c" "${cuota:-?}" "$n" "$cpu_s" "$por"
done

echo
echo '── OTROS CONSUMIDORES (no recolectan, pero comen de la misma máquina) ──'
for c in facylf-importador facylf-postgres facylf-web facylf-monitor; do
  pid=$(docker inspect -f '{{.State.Pid}}' "$c" 2>/dev/null); [ -z "$pid" ] && continue
  cg="/sys/fs/cgroup$(awk -F: '/^0::/ { print $3 }' /proc/$pid/cgroup 2>/dev/null)"
  u2=$(awk '/^usage_usec/ { print $2 }' "$cg/cpu.stat" 2>/dev/null); [ -z "$u2" ] && continue
  cpu_s=$(awk -v a="${U0[$c]:-0}" -v b="$u2" 'BEGIN { printf "%.1f", (b - a) / 1000000 }')
  printf '  %-30s %s cpu-s en %s s de reloj\n' "$c" "$cpu_s" "$VENTANA"
done

echo
echo "  «cpu-s/petición» = procesador consumido por esa federación dividido entre sus peticiones."
echo "  Si es grande, el techo es la máquina. Si es pequeño y el ciclo es largo, el techo es la espera."
echo "  Núcleos de la máquina: $(nproc) · load: $(cut -d' ' -f1-3 /proc/loadavg)"
