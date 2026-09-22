#!/usr/bin/env bash
# ── ¿ESTÁ LA FLOTA AHOGADA POR SU PROPIA CUOTA DE CPU? ──────────────────────────────────────────────────
#
# Cada servicio del compose lleva `cpus: 0.N` (una cuota de CPU de Docker, derivada del reparto de turnos).
# Si la SUMA de esas cuotas es mayor que los núcleos de la máquina, la máquina está sobrevendida; y si
# además un contenedor concreto se queda sin cuota mientras trabaja, el kernel lo FRENA aunque sobre CPU:
# eso es `nr_throttled` en su `cpu.stat`, y es invisible en `top` (que sólo enseña CPU, no frenos).
#
# Este guion separa las tres cosas que se confunden:
#   · cuánta CPU se está usando DE VERDAD       → `docker stats`;
#   · cuánta se ha pedido como tope             → suma de `cpus` del compose;
#   · cuántas veces se ha FRENADO a cada uno    → `cpu.stat` de su cgroup.
#
# SÓLO LECTURA. No cambia cuotas ni reinicia nada.
#
# Uso: bash scripts/servidor/mide-cpu-contenedores.sh [segundos_de_muestra]
set -uo pipefail

MUESTRA=${1:-10}
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
COMPOSE="$RAIZ/docker/compose-turnos.yml"

echo '════════════════ ¿CUÁNTA CPU HAY Y CUÁNTA SE PIDE? ════════════════'
echo "  núcleos de la máquina: $(nproc)"
echo "  load average:          $(cut -d' ' -f1-3 /proc/loadavg)"
echo

if [ -f "$COMPOSE" ]; then
  # La suma de las cuotas `cpus:` del reparto de turnos. Es lo que la flota puede pedir COMO MÁXIMO.
  # LC_ALL=C: con la configuración regional en español, awk escribiría la coma decimal y la suma saldría «17,20».
  suma=$(LC_ALL=C awk '/^[[:space:]]+cpus:/ { s += $2 } END { printf "%.2f", s }' "$COMPOSE")
  cuantos=$(grep -c '^[[:space:]]\+cpus:' "$COMPOSE")
  echo "  cuotas del reparto:    $cuantos contenedores con cuota · suma $suma núcleos"
  echo "  (si la suma supera $(nproc), la máquina está sobrevendida: los contenedores se estorban entre sí)"
else
  echo "  (no se encuentra $COMPOSE)"
fi
echo

echo '════════════════ CONSUMO REAL POR CONTENEDOR ════════════════'
# Una muestra de verdad (dos lecturas separadas), no una foto instantánea: `docker stats --no-stream`
# promedia desde que arrancó el contenedor y engaña con contenedores que llevan días en marcha.
docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.PIDs}}' \
  $(docker ps --filter 'name=facylf' --format '{{.Names}}') 2>/dev/null \
  | sort -t$'\t' -k2 -hr | head -30 | sed 's/^/  /'
echo

echo '════════════════ FRENOS DEL KERNEL (lo que `top` no enseña) ════════════════'
echo '  contenedor                     cuota      frenado_ms/ventana   nº_frenos   %tiempo_frenado'
for c in $(docker ps --filter 'name=facylf' --format '{{.Names}}' | sort); do
  # El cgroup v2 del contenedor. `cpu.stat` acumula desde que el contenedor arrancó.
  ruta=$(docker inspect -f '{{.State.Pid}}' "$c" 2>/dev/null)
  [ -z "$ruta" ] && continue
  estadio="/sys/fs/cgroup/system.slice/docker-$(docker inspect -f '{{.Id}}' "$c" 2>/dev/null).scope/cpu.stat"
  [ -f "$estadio" ] || estadio="/sys/fs/cgroup$(awk -F: '/^0::/ { print $3 }' /proc/$ruta/cgroup 2>/dev/null)/cpu.stat"
  if [ ! -f "$estadio" ]; then
    printf '  %-30s (sin cpu.stat legible)\n' "$c"
    continue
  fi
  # Cuota efectiva: `cpu.max` es «cuota periodo» en microsegundos.
  maxruta=$(dirname "$estadio")/cpu.max
  cuota=$(awk '{ if ($1 == "max") print "sin tope"; else printf "%.2f", $1 / $2 }' "$maxruta" 2>/dev/null)
  a=$(awk '/^nr_throttled/ { print $2 }' "$estadio")
  b=$(awk '/^throttled_usec/ { print $2 }' "$estadio")
  sleep 0.2
  a2=$(awk '/^nr_throttled/ { print $2 }' "$estadio")
  b2=$(awk '/^throttled_usec/ { print $2 }' "$estadio")
  printf '  %-30s %-9s %-20s %-11s\n' "$c" "${cuota:-?}" \
    "$(( (b2 - b) / 1000 )) ms" "$(( a2 - a ))"
done
echo
echo '  «frenado_ms/ventana» y «nº_frenos» son el INCREMENTO durante la ventana de 0,2 s: si no son cero en'
echo '  varios contenedores a la vez, la flota se está peleando por la CPU y el techo no lo pone ningún portal.'
echo '  El total acumulado desde el arranque se puede ver en el mismo fichero (throttled_usec).'
