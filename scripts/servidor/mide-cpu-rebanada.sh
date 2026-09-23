#!/usr/bin/env bash
# Cuántos segundos de procesador cuesta UNA página, medido en toda la rebanada de facylf.
#
# Es la cifra que decide si la máquina está en su techo: si está al 100 % de procesador, el máximo de páginas por
# minuto es `núcleos × 60 / cpu-s por página`. Leer `cpu.stat` de la rebanada es una lectura de un fichero, así
# que no añade carga (a diferencia de `docker stats`).
#
# SÓLO LEE.
#
# Uso: bash scripts/servidor/mide-cpu-rebanada.sh [segundos]
set -uo pipefail

VENTANA=${1:-60}
SLICE=/sys/fs/cgroup/facylf.slice/cpu.stat

[ -f "$SLICE" ] || { echo "no existe $SLICE"; exit 1; }

leer_uso() { awk '/^usage_usec/ { print $2 }' "$SLICE"; }

u0=$(leer_uso)
t0=$(date +%s)
echo "midiendo $VENTANA s del procesador de toda la rebanada…"
sleep "$VENTANA"
u1=$(leer_uso)
t1=$(date +%s)

cpu_s=$(awk -v a="$u0" -v b="$u1" 'BEGIN { printf "%.1f", (b - a) / 1000000 }')
reloj=$(( t1 - t0 ))
nucleos=$(nproc)

echo
echo "  ventana:                 ${reloj} s"
echo "  procesador consumido:    ${cpu_s} cpu-s"
echo "  núcleos de la máquina:   ${nucleos}"
echo "  ocupación media:         $(awk -v c="$cpu_s" -v r="$reloj" -v n="$nucleos" 'BEGIN { printf "%.2f de %d núcleos (%.0f %%)", c / r, n, 100 * c / r / n }')"

echo
echo "  ── qué implica, según las peticiones que se estén haciendo ──"
echo '  Si el ritmo actual son P peticiones por minuto, cada una cuesta:'
for p in 40 50 60 67 75 85 100; do
  printf '    a %3s pet/min → %5.2f cpu-s por petición   (techo teórico: %s pet/min con 4 núcleos)\n' \
    "$p" "$(awk -v c="$cpu_s" -v r="$reloj" -v p="$p" 'BEGIN { printf "%.2f", c / r * 60 / p }')" \
    "$(awk -v c="$cpu_s" -v r="$reloj" -v n="$nucleos" 'BEGIN { printf "%.0f", n * 60 / (c / r * 60 / 67) * 67 / 67 }')"
done
echo
echo "  El techo con TODOS los núcleos dedicados a pedir páginas, al coste actual por página:"
awk -v c="$cpu_s" -v r="$reloj" -v n="$nucleos" 'BEGIN {
  porPagina = c / r * 60 / 67;   # al ritmo actual de 67 pet/min
  printf "    %d núcleos × 60 s ÷ %.2f cpu-s por página = %.0f pet/min\n", n, porPagina, n * 60 / porPagina
}'
