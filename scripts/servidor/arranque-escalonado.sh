#!/usr/bin/env bash
# ── ARRANQUE ESCALONADO DE LA FLOTA DE FACyLF ───────────────────────────────────────────────────────────
#
# El 16/11/2026 la carga llegó a 19,80 con 16 recolectores abriendo página a la vez; escalonarlos la bajó a
# 2,24. Pero eso se hizo a mano. Y hay un detalle que lo repite solo: los servicios del compose llevan
# `restart: unless-stopped`, así que **después de un reinicio del servidor arrancan los 16 de golpe**.
#
# Esto lo evita: para todos, los arranca de uno en uno y, entre uno y otro, mira la carga del sistema. Si la
# carga pasa del umbral, deja de arrancar y lo dice. Nunca arranca nada que ya esté arriba.
#
# Uso (en el servidor, después de un reinicio):
#   bash /srv/data/facylf/scripts/servidor/arranque-escalonado.sh
#   FACYLF_UMBRAL_CARGA=4 FACYLF_RETRASO=60 bash …/arranque-escalonado.sh
#
# Sale con 0 si los arrancó todos, 2 si se paró por carga y 1 si falta el comando.
set -uo pipefail

DOCKER="${FACYLF_DOCKER:-docker}"
UMBRAL="${FACYLF_UMBRAL_CARGA:-5.0}"     # carga de 1 minuto por encima de la cual se espera
RETRASO="${FACYLF_RETRASO:-45}"          # segundos entre arranques (deja respirar al anterior)
ESPERA_MAX="${FACYLF_ESPERA_MAX:-1800}"  # cuánto se espera como mucho a que baje la carga
LOADAVG="${FACYLF_LOADAVG:-/proc/loadavg}"

manda_docker() { "$DOCKER" "$@" >/dev/null 2>&1; }

# La carga: primera cifra de /proc/loadavg. Se lee de un fichero para poder probarlo sin el servidor.
carga() {
  local linea
  linea="$(tail -n 1 "$LOADAVG" 2>/dev/null | awk '{print $1}')"
  echo "${linea:-0}"
}

# ¿Está por encima del umbral? Comparación con awk para no depender de `bc` (el servidor no lo tiene).
supera_umbral() {
  awk -v a="$1" -v b="$UMBRAL" 'BEGIN { exit !(a > b) }'
}

# Los recolectores: servicios `facylf-<algo>-1`, sin la base, la web, el monitor ni el importador.
lista_recolectores() {
  "$DOCKER" ps -a --format '{{.Names}}' 2>/dev/null \
    | grep -E '^facylf-[a-z-]+-1$' \
    | grep -Ev '^facylf-(postgres|web|monitor|importador)-1$' \
    | sort
}

# Castilla y León primero: es la federación prioritaria del proyecto y su plaza va reservada. El resto, por
# orden alfabético para que dos ejecuciones hagan lo mismo (el orden de `docker ps` no está garantizado).
ordena() {
  awk '{ if ($0 == "facylf-federacion-1") print "0 " $0; else print "1 " $0 }' | sort | cut -d' ' -f2-
}

# ── 0. COMPROBACIONES ────────────────────────────────────────────────────────────────────────────────
command -v "$DOCKER" >/dev/null 2>&1 || { echo "No está el comando '$DOCKER'." >&2; exit 1; }

mapfile -t recolectores < <(lista_recolectores | ordena)
if [ "${#recolectores[@]}" -eq 0 ]; then
  echo "No hay recolectores que arrancar (¿el demonio de Docker está arriba?)."
  exit 0
fi

echo "Recolectores: ${#recolectores[@]} · umbral de carga ${UMBRAL} · ${RETRASO}s entre arranques"
echo "Arranque: $(date '+%Y-%m-%d %H:%M:%S')"

# ── 1. PARAR TODO ──────────────────────────────────────────────────────────────────────────────────────
# Parar primero es lo que evita que los 15 se peleen por CPU y memoria mientras se levantan uno a uno.
for c in "${recolectores[@]}"; do
  manda_docker stop --time 20 "$c" && echo "  parado  $c"
done

# ── 2. ARRANCAR DE UNO EN UNO, MIRANDO LA CARGA ────────────────────────────────────────────────────────
arrancados=(); pendientes=(); esperado=0
for c in "${recolectores[@]}"; do
  # Se espera a que la carga baje: si el anterior aún está abriendo Chrome, arrancar el siguiente lo dobla.
  while supera_umbral "$(carga)" && [ "$esperado" -lt "$ESPERA_MAX" ]; do
    echo "  carga $(carga) > $UMBRAL; esperando 15s…"
    sleep 15; esperado=$((esperado + 15))
  done
  if supera_umbral "$(carga)"; then
    echo "  carga $(carga) sigue por encima de $UMBRAL tras ${ESPERA_MAX}s: se deja el resto parado."
    pendientes+=("$c"); continue
  fi

  if manda_docker start "$c"; then
    arrancados+=("$c")
    echo "  arrancado $c  (carga $(carga))"
  else
    pendientes+=("$c")
    echo "  ⚠ no arrancó $c"
  fi
  [ "$RETRASO" -gt 0 ] && sleep "$RETRASO"
done

# ── 3. RESUMEN ─────────────────────────────────────────────────────────────────────────────────────────
echo
echo "Arrancados: ${#arrancados[@]}${arrancados[*]:+ → ${arrancados[*]}}"
if [ "${#pendientes[@]}" -gt 0 ]; then
  echo "Pendientes: ${#pendientes[@]} (se quedan parados a propósito) → ${pendientes[*]}"
  echo "Cuando la carga baje, vuelve a lanzar este mismo guion: sólo arranca los que faltan."
  exit 2
fi
echo "Flota completa y escalonada."
