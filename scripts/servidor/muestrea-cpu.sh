#!/usr/bin/env bash
# ── MUESTREO DE CPU Y PETICIONES, EN EL TIEMPO ──────────────────────────────────────────────────────────
#
# Una sola foto no distingue dos cosas que se arreglan de forma opuesta:
#
#   · **gasto fijo** — lo que cuesta TENER abierto un Chrome (aunque no pida nada). Si esto es grande, tener
#     16 navegadores abiertos se come la máquina y la solución es tener MENOS a la vez, no más;
#   · **gasto por petición** — lo que cuesta cada página. Si esto es grande, la solución es que cada página
#     cueste menos (dejar de renderizar, bloquear más recursos) o tener más procesador.
#
# Este guion toma muestras periódicas del procesador consumido por cada contenedor (`cpu.stat`) y deja el
# fichero listo para cruzar con las peticiones de cada federación en los mismos intervalos.
#
# SÓLO LECTURA sobre el sistema: lee cgroups, no toca contenedores ni colas.
#
# Uso: bash scripts/servidor/muestrea-cpu.sh [minutos] [segundos_entre_muestras]
set -uo pipefail

MINUTOS=${1:-10}
CADA=${2:-20}
SALIDA=${FACYLF_SALIDA:-/srv/data/facylf/estado/cpu-muestras.csv}

# La cabecera sólo una vez: si se relanza, se añade al mismo fichero y el análisis lo agrupa por época.
if [ ! -f "$SALIDA" ]; then
  echo 'epoch,contenedor,usage_usec' > "$SALIDA"
fi

fin=$(( $(date +%s) + MINUTOS * 60 ))
while [ "$(date +%s)" -lt "$fin" ]; do
  t=$(date +%s)
  for c in $(docker ps --filter 'name=facylf' --format '{{.Names}}' | sort); do
    pid=$(docker inspect -f '{{.State.Pid}}' "$c" 2>/dev/null)
    [ -z "$pid" ] && continue
    cg="/sys/fs/cgroup$(awk -F: '/^0::/ { print $3 }' /proc/$pid/cgroup 2>/dev/null)"
    u=$(awk '/^usage_usec/ { print $2 }' "$cg/cpu.stat" 2>/dev/null)
    [ -n "$u" ] && echo "$t,$c,$u" >> "$SALIDA"
  done
  sleep "$CADA"
done
echo "muestreo terminado: $SALIDA"
