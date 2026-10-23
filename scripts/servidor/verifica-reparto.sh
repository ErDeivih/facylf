#!/usr/bin/env bash
# verifica-reparto.sh — ¿está el trabajo repartido como debe, entre servidor y PC?
#
# ── QUÉ RESPONDE ────────────────────────────────────────────────────────────────────────────────────────
#
# Desde el 24/09/2026 Valencia, Madrid y Cataluña se recogen en el PC y las otras dieciséis en el servidor. Este
# guion comprueba las tres cosas que pueden salir mal en un reparto así:
#
#   1. Que las tres del PC NO estén corriendo aquí (si lo estuvieran, se pediría dos veces a los mismos portales).
#   2. Que las dieciséis estén corriendo y **cuenten exactamente 16** (una de menos es una federación que no
#      recoge nadie; una de más es una duplicada).
#   3. Que entre lo que corre aquí y lo que corre en el PC estén LAS 19, sin repetidas y sin olvidadas.
#
# SÓLO LEE.
#
# Uso:  bash scripts/servidor/verifica-reparto.sh
set -uo pipefail
export LC_ALL=C

AQUI=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura
      federacion galicia melilla murcia navarra rioja)
EN_EL_PC=(valencia madrid cataluna)

echo "══ 1. ¿Están paradas en el servidor las tres que recoge el PC? ══"
for f in "${EN_EL_PC[@]}"; do
  estado=$(docker inspect "facylf-${f}-1" --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  marca='OK'
  [ "$estado" = "exited" ] || marca='REVISAR: deberia estar parada'
  printf '  %-10s %-8s %s\n' "$f" "$estado" "$marca"
done

echo
echo "══ 2. ¿Están en marcha las dieciséis del servidor? ══"
faltan=0
for f in "${AQUI[@]}"; do
  estado=$(docker inspect "facylf-${f}-1" --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  if [ "$estado" != "running" ]; then echo "  FALTA o no corre: ${f} (${estado})"; faltan=$((faltan + 1)); fi
done
[ "$faltan" = "0" ] && echo "  las 16 en marcha" || echo "  ${faltan} con problema"

echo
echo "══ 3. La cuenta tiene que cerrar: 16 + 3 = 19, sin repetidas ══"
en_marcha=$(docker ps --format '{{.Names}}' 2>/dev/null \
  | grep -vE 'importador|monitor|web|postgres|fin-de-semana' | wc -l)
echo "  recolectores en marcha aquí: ${en_marcha} (deben ser 16)"
duplicadas=0
for f in "${EN_EL_PC[@]}"; do
  case " ${AQUI[*]} " in *" ${f} "*) echo "  ${f} está en LAS DOS listas"; duplicadas=$((duplicadas + 1));; esac
done
echo "  federaciones en las dos listas: ${duplicadas}"
echo "  total cubierto: $(( ${#AQUI[@]} + ${#EN_EL_PC[@]} )) federaciones"

echo
echo "══ 4. El registro de Docker: ¿se puede reconstruir una imagen? ══"
echo "  registros A (IPv4):  $(getent ahostsv4 registry-1.docker.io 2>/dev/null | head -1 | awk '{print $1}' || echo 'ninguno')"
echo "  registros AAAA:      $(getent ahostsv6 registry-1.docker.io 2>/dev/null | head -1 | awk '{print $1}' || echo 'ninguno')"
ruta6=$(ip -6 route show default 2>/dev/null | head -1)
echo "  ruta IPv6 por defecto: ${ruta6:-NINGUNA}"
if timeout 15 bash -c 'exec 3<>/dev/tcp/registry-1.docker.io/443' 2>/dev/null; then
  echo "  conexión al registro: CONECTA (se puede reconstruir)"
else
  echo "  conexión al registro: NO CONECTA — sin esto no hay reconstrucciones de imagen"
fi

echo
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
