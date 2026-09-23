#!/usr/bin/env bash
# ¿De dónde sale una carga de 130 con 4 núcleos? La carga cuenta procesos EJECUTANDO y BLOQUEADOS, así que
# hay que separarlos: si manda «D» (espera de E/S) el problema es el disco aunque el procesador esté al 100 %;
# si manda «R» (listos para ejecutar) es contención de procesador pura, y con 4 núcleos al 100 % eso significa
# que hay mucha cola y poco que rascar sin quitar trabajo.
#
# SÓLO LEE.
set -uo pipefail

echo '── carga y reparto de estados ──'
echo "  load: $(cut -d' ' -f1-3 /proc/loadavg)"
total=$(ls /proc | grep -c '^[0-9]')
echo "  procesos vivos: $total"
for estado in R D S T Z; do
  n=$(grep -l "^State:.*\b$estado" /proc/[0-9]*/status 2>/dev/null | wc -l)
  etiqueta=''
  case "$estado" in
    R) etiqueta='ejecutando o listo' ;;
    D) etiqueta='BLOQUEADO en E/S (disco)' ;;
    S) etiqueta='dormido' ;;
    T) etiqueta='parado' ;;
    Z) etiqueta='zombi' ;;
  esac
  printf '  %s  %6s   %s\n' "$estado" "$n" "$etiqueta"
done
echo

echo '── quién tiene más procesos ──'
ps -eo comm --no-headers 2>/dev/null | sort | uniq -c | sort -rn | head -8 | sed 's/^/  /'
echo

echo '── memoria y swap ──'
free -m | sed 's/^/  /'
echo
echo '  Si el swap está en uso alto, además de ir lleno se está paginando: eso multiplica la carga.'
