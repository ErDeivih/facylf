#!/usr/bin/env bash
# La carga de Linux cuenta TAREAS (hilos), no procesos. Chrome abre decenas de hilos por instancia, así que con
# 19 recolectores una carga alta puede ser normal y no significar avería — pero también puede ser contención de
# verdad. Esto separa las dos cosas: cuenta HILOS por estado y dice cuántos están ejecutando de verdad.
#
# SÓLO LEE.
set -uo pipefail

echo '── hilos por estado (la carga cuenta hilos, no procesos) ──'
# El primer carácter de STAT es el estado: R ejecutando, D espera de E/S, S dormido.
ps -eLo stat --no-headers 2>/dev/null | cut -c1 | sort | uniq -c | sort -rn | sed 's/^/  /'
echo

echo '── de quién son los hilos que están EJECUTANDO ──'
ps -eLo stat,comm --no-headers 2>/dev/null | awk '$1 ~ /^R/ { print $2 }' | sort | uniq -c | sort -rn | head -8 | sed 's/^/  /'
echo

echo '── y los que esperan E/S ──'
ps -eLo stat,comm --no-headers 2>/dev/null | awk '$1 ~ /^D/ { print $2 }' | sort | uniq -c | sort -rn | head -8 | sed 's/^/  /'
echo

echo '── núcleos ocupados ──'
echo "  núcleos: $(nproc)"
echo "  carga:   $(cut -d' ' -f1-3 /proc/loadavg)"
echo
echo '  Lectura: si los «R» son muchos más que los núcleos, hay cola de procesador: la máquina está haciendo lo'
echo '  que puede y el ritmo lo fija el procesador. Si los «D» son muchos, el cuello es el disco.'
echo '  Y si «R» es pequeño y la carga alta, la carga viene de hilos que esperan algo que no es ni CPU ni disco.'
