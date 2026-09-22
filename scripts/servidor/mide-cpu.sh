#!/usr/bin/env bash
# ── CUÁNTO PROCESADOR SE ESTÁ USANDO DE VERDAD, POR GRUPO ───────────────────────────────────────────────
#
# `docker stats --no-stream` da una FOTO instantánea: con la flota entrando y saliendo de la espera, dos
# medidas seguidas pueden diferir en un núcleo entero. Esto MIDE un intervalo: lee el consumo acumulado de cada
# contenedor (`cpu.stat`, en microsegundos de CPU) y el del sistema (`/proc/stat`), espera los segundos que se
# le pidan y vuelve a leer. La diferencia dividida por el tiempo es el uso real, no una impresión.
#
# La ruta del cgroup NO es siempre la misma: los recolectores cuelgan de su propia rebanada
# (`cgroup_parent: facylf.slice` en el compose), así que se busca `docker-<id>.scope` en el árbol. Medido el
# 22/09/2026: dar por hecho `/sys/fs/cgroup/system.slice/...` daba 0,00 núcleos a toda la flota.
#
# Uso:
#   bash scripts/servidor/mide-cpu.sh            # 60 s de medida
#   bash scripts/servidor/mide-cpu.sh 120        # 120 s
set -uo pipefail

SEGUNDOS=${1:-60}
declare -A RUTAS

# La ruta del cgroup de un contenedor (se busca una vez y se recuerda: `find` cuesta).
ruta_de() {
  local contenedor="$1" id
  if [ -n "${RUTAS[$contenedor]:-}" ]; then echo "${RUTAS[$contenedor]}"; return 0; fi
  id=$(docker inspect -f '{{.Id}}' "$contenedor" 2>/dev/null) || return 1
  [ -n "$id" ] || return 1
  local carpeta
  carpeta=$(find /sys/fs/cgroup -maxdepth 4 -name "docker-$id.scope" 2>/dev/null | head -1)
  [ -n "$carpeta" ] || return 1
  RUTAS[$contenedor]="$carpeta"
  echo "$carpeta"
}

# Uso acumulado del contenedor, en microsegundos.
uso_de() {
  local carpeta
  carpeta=$(ruta_de "$1") || return 1
  awk '/^usage_usec/ { print $2 }' "$carpeta/cpu.stat" 2>/dev/null
}

uso_del_sistema() {
  awk '/^cpu / { s = 0; for (i = 2; i <= 8; i++) s += $i; print s }' /proc/stat
}

mapfile -t CONTENEDORES < <(docker ps --format '{{.Names}}' | sort)

declare -A antes
sin_ruta=0
for c in "${CONTENEDORES[@]}"; do
  antes[$c]=$(uso_de "$c") || { antes[$c]=''; sin_ruta=$((sin_ruta + 1)); }
done
sistema_antes=$(uso_del_sistema)
inicio=$(date +%s.%N)

echo "midiendo ${SEGUNDOS} s sobre ${#CONTENEDORES[@]} contenedores (sin ruta de cgroup: $sin_ruta)…"
sleep "$SEGUNDOS"

fin=$(date +%s.%N)
sistema_despues=$(uso_del_sistema)
transcurrido=$(awk -v a="$inicio" -v b="$fin" 'BEGIN { print b - a }')

declare -A deltas
facylf=0; radiopv=0; otros=0
for c in "${CONTENEDORES[@]}"; do
  ahora=$(uso_de "$c" || echo '')
  d=0
  if [ -n "${antes[$c]}" ] && [ -n "$ahora" ]; then
    d=$(awk -v a="${antes[$c]}" -v b="$ahora" 'BEGIN { v = (b - a) / 1000000; if (v < 0) v = 0; printf "%.6f", v }')
  fi
  deltas[$c]=$d
  case "$c" in
    facylf-*) facylf=$(awk -v x="$facylf" -v d="$d" 'BEGIN { print x + d }') ;;
    radiopv-*) radiopv=$(awk -v x="$radiopv" -v d="$d" 'BEGIN { print x + d }') ;;
    *) otros=$(awk -v x="$otros" -v d="$d" 'BEGIN { print x + d }') ;;
  esac
done

printf '\n%-26s %14s %15s\n' contenedor "s de CPU" "núcleos medios"
for c in $(printf '%s\n' "${CONTENEDORES[@]}" | while read -r n; do echo "${deltas[$n]} $n"; done | sort -rn | awk '{ print $2 }'); do
  awk -v d="${deltas[$c]}" -v t="$transcurrido" 'BEGIN { if (d < 0.05) exit 1 }' || continue
  printf '%-26s %14.1f %15.2f\n' "$c" "${deltas[$c]}" "$(awk -v d="${deltas[$c]}" -v t="$transcurrido" 'BEGIN { print d / t }')"
done

nucleos=$(nproc)
nucleos_de() { awk -v d="$1" -v t="$transcurrido" 'BEGIN { print d / t }'; }
porcentaje_de() { awk -v d="$1" -v t="$transcurrido" -v n="$nucleos" 'BEGIN { print 100 * d / t / n }'; }
printf '\n── reparto de %s núcleos en %.0f s ──\n' "$nucleos" "$transcurrido"
printf '  facylf   (19 recolectores + base + web + importador + monitor): %.2f núcleos (%.0f %% del servidor)\n' \
  "$(nucleos_de "$facylf")" "$(porcentaje_de "$facylf")"
printf '  radiopv  (api + web + worker + collector):                      %.2f núcleos (%.0f %%)\n' \
  "$(nucleos_de "$radiopv")" "$(porcentaje_de "$radiopv")"
printf '  resto de contenedores (navidrome, ntfy, kuma, portainer…):      %.2f núcleos (%.0f %%)\n' \
  "$(nucleos_de "$otros")" "$(porcentaje_de "$otros")"

busy=$(awk -v a="$sistema_antes" -v b="$sistema_despues" -v t="$transcurrido" -v n="$nucleos" \
  'BEGIN { print 100 * (b - a) / 100 / t / n }')
printf '\n  SISTEMA ENTERO: %.0f %% de %s núcleos ocupado (%.2f núcleos); lo que no aparece arriba es el propio\n' \
  "$busy" "$nucleos" "$(awk -v b="$busy" -v n="$nucleos" 'BEGIN { print b * n / 100 }')"
printf '  sistema operativo y procesos fuera de contenedor.\n'
