#!/usr/bin/env bash
# ── ¿ESTÁ EL PROCESADOR TRABAJANDO O ESPERANDO AL DISCO? ────────────────────────────────────────────────
#
# `top`/`/proc/stat` dan un «ocupado» que ENGAÑA: la cifra habitual (todo menos `idle`) incluye el **iowait**, que
# es tiempo en el que el procesador NO está calculando, sino esperando a que el disco conteste. Medido en el
# servidor el 22/09/2026: «98 % ocupado» con los contenedores sumando 1,1 núcleos — la diferencia no era CPU,
# era disco.
#
# Esto separa las dos cosas midiendo un intervalo:
#
#   · **cpu de verdad** = user + nice + system + irq + softirq   (lo que el procesador calcula)
#   · **iowait**        = esperando a disco/red                   (cuello de disco, no de CPU)
#   · **idle**          = libre
#
# Uso: bash scripts/servidor/estado-cpu-real.sh [segundos]
set -uo pipefail

SEGUNDOS=${1:-30}

lee() {
  awk '/^cpu / { printf "%s %s %s %s %s %s %s %s %s %s\n", $2, $3, $4, $5, $6, $7, $8, $9, $10, $11 }' /proc/stat
}

antes=$(lee)
echo "midiendo $SEGUNDOS s…"
sleep "$SEGUNDOS"
despues=$(lee)

awk -v a="$antes" -v b="$despues" -v n="$(nproc)" -v s="$SEGUNDOS" '
BEGIN {
  # OJO con los nombres: `system` es una FUNCIÓN incorporada de awk y no se puede usar como variable (el error
  # que dio la primera versión de este guion: «syntax error at or near =»).
  split(a, x, " "); split(b, y, " ");
  usr = y[1] - x[1]; niz = y[2] - x[2]; sis = y[3] - x[3]; ocioso = y[4] - x[4];
  io = y[5] - x[5]; irq = y[6] - x[6]; sirq = y[7] - x[7]; robo = y[8] - x[8];
  total = usr + niz + sis + ocioso + io + irq + sirq + robo;
  calculando = usr + niz + sis + irq + sirq;
  printf "  procesador calculando: %5.1f %%  (%.2f de %s nucleos)\n", 100 * calculando / total, calculando / 100 / s, n;
  printf "    · en usuario:        %5.1f %%\n", 100 * usr / total;
  printf "    · en sistema:        %5.1f %%\n", 100 * sis / total;
  printf "  esperando a disco:     %5.1f %%  <-- esto NO es CPU\n", 100 * io / total;
  printf "  libre:                 %5.1f %%\n", 100 * ocioso / total;
  if (100 * io / total > 25) printf "\n  AVISO: mas de una cuarta parte del tiempo es espera de disco: el cuello es el DISCO, no el procesador.\n";
}'
