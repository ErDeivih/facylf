#!/usr/bin/env bash
# mide-avance-build.sh — ¿la compilación de la web AVANZA o está clavada?
#
# ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
#
# Medido el 24/09/2026: `next build` llevaba 13 minutos con **0,9 % de CPU de media** y sin procesos hijos de
# compilación, lo que parece un cuelgue. No lo es, y conviene poder distinguirlo:
#
#   · no espera a la red — **cero sockets abiertos** en el proceso;
#   · no está estrangulado por el cgroup del proyecto — `facylf.slice` no limita CPU (`cpu.max` = max) y
#     `nr_throttled` es 0;
#   · está en estado **R (ejecutable)**: quiere correr y no le toca. Con dieciséis recolectores y sus Chromium
#     sobre CUATRO núcleos, el build se queda con las migajas, y `ps` muestra su media desde que arrancó, no lo
#     que usa ahora.
#
# Este guion mide lo que de verdad importa: cuánto CPU CONSUME en una ventana corta. Si el contador sube, avanza
# —despacio, pero avanza— y lo correcto es esperar. Si no sube nada, está clavado y hay que mirarlo.
#
# NO se pausan recolectores para acelerarlo: los invariantes del proyecto prohíben cambiar su ritmo como efecto
# lateral de una tarea web. La compilación va a la velocidad que le deje la recolección, y por eso el despliegue
# está encadenado en vez de esperado a mano.
#
# Sólo lee /proc y el registro.
#
# Uso:  bash scripts/servidor/mide-avance-build.sh [segundos]
set -uo pipefail
export LC_ALL=C

VENTANA="${1:-60}"

# El patrón de búsqueda va DENTRO del fichero a propósito (regla del traspaso): escrito en la línea de órdenes de
# `ssh`, el patrón aparecería en la propia línea y `pgrep` se encontraría a sí mismo.
pids=$(pgrep -f 'next build' 2>/dev/null || true)
if [ -z "$pids" ]; then
  echo "no hay ninguna compilación de Next en marcha (¿ya terminó?)"
  exit 0
fi

# Se suman los tiempos de usuario y sistema de todos los procesos de la compilación.
lee() {
  local total=0
  for p in $pids; do
    [ -r "/proc/$p/stat" ] || continue
    # Los campos 14 y 15 son utime y stime, en unidades de reloj. `awk` sobre la línea entera: el campo 2 (el
    # nombre) puede llevar espacios y paréntesis, así que se corta por el último ')'.
    t=$(sed 's/.*) //' "/proc/$p/stat" 2>/dev/null | awk '{print $12 + $13}')
    total=$((total + ${t:-0}))
  done
  echo "$total"
}

a=$(lee)
echo "── compilación en marcha (PID(s): $(echo $pids | tr '\n' ' ')) ──"
echo "  CPU acumulada ahora:        ${a} ticks"
echo "  esperando ${VENTANA} s para ver cuánto avanza…"
sleep "$VENTANA"
b=$(lee)

# La unidad de reloj son 100 ticks por segundo en Linux (USER_HZ).
avance=$((b - a))
segundos=$(awk "BEGIN {printf \"%.1f\", $avance / 100}")

echo
echo "  CPU acumulada después:      ${b} ticks"
echo "  consumido en ${VENTANA} s:        ${avance} ticks = ${segundos} s de CPU"
if [ "$avance" -le 0 ]; then
  echo
  echo "  CLAVADO: no ha consumido CPU en la ventana. Hay que mirarlo."
  exit 1
fi
echo
echo "  AVANZA: la compilación consume CPU, va lenta porque compite con la recolección."
echo "  Tiempo estimado de CPU que le queda: no se puede saber sin ver el registro; lo que sí se sabe es que no"
echo "  está parada, así que lo correcto es esperar a que termine (el despliegue está encadenado)."
echo
echo "  carga del sistema: $(cut -d' ' -f1-3 /proc/loadavg)"
