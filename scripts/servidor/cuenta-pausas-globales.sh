#!/usr/bin/env bash
# cuenta-pausas-globales.sh — cuánto tiempo pierde la flota por las pausas globales preventivas
#
# ── POR QUÉ ─────────────────────────────────────────────────────────────────────────────────────────────
#
# El registro de Madrid del 23-24/09/2026 muestra esto: cinco actas de UNA competición agotan el tiempo de
# espera (~40 s cada una), `fallosSeguidos` llega a 5 y el worker se para UNA HORA entera («Pausa global
# preventiva … por fallos repetidos», «siguiente intento en 3571 s»). Al reanudar, otras cuatro actas del
# mismo grupo vuelven a agotar el tiempo y la paran otra hora. La federación tenía 7.108 actas disponibles.
#
# Tres minutos de páginas lentas cuestan una hora de recolección: 90 a 1. Este script cuantifica cuántas de
# esas pausas hay en toda la flota y por qué motivo, para decidir con datos si el contador de fallos
# seguidos debe contar un tiempo de espera agotado (que es de ESA dirección, y puede ser de la máquina)
# igual que cuenta un rechazo del portal (que sí es de la federación).
#
# SÓLO LEE los registros. No toca contenedores ni bases.
#
# Uso:  bash scripts/servidor/cuenta-pausas-globales.sh [horas]
set -u
HORAS="${1:-24}"
RAIZ="${FACYLF_RAIZ:-/srv/data/facylf}"
SSD="${FACYLF_SSD:-/srv/ssd/facylf}"
export LC_ALL=C

echo "══ Pausas globales preventivas de los recolectores (últimas ${HORAS} h) ══"
echo

printf '%-22s %8s %8s %10s  %s\n' FEDERACION PAUSAS SESIONES SEG.PERDIDOS MOTIVO_PRINCIPAL
for dir in "$SSD"/descargas-* "$RAIZ"/descargas-*; do
  [ -d "$dir" ] || continue
  fed="$(basename "$dir")"; fed="${fed#descargas-}"
  log="$dir/recolector-local/worker-programado.log"
  [ -f "$log" ] || continue

  # El registro no lleva marca de tiempo en la línea de pausa, así que se usan las marcas de las líneas
  # «2026-09-23 23:15:31  El worker termino … ; siguiente intento en N s», que sí la llevan y son las que
  # miden el tiempo realmente perdido.
  pausas="$(grep -c 'Pausa global preventiva' "$log" 2>/dev/null || true)"
  sesiones="$(grep -c 'Sesión terminada' "$log" 2>/dev/null || true)"
  # Trampa ya sufrida: `match($0, /re/, m)` es extensión de GNU awk y mawk NO la tiene (falla en silencio y
  # deja la columna a cero). Aquí se extrae con sub(), que es portable. La fecha y los segundos van en la
  # MISMA línea («2026-09-23 23:15:31  El worker termino …; siguiente intento en 3571 s.»), así que basta
  # comparar texto: el formato es de ancho fijo y ordena igual que el tiempo.
  perdidos="$(awk -v corte="$(date -d "-${HORAS} hours" '+%Y-%m-%d %H:%M:%S')" '
    /siguiente intento en [0-9]+ s/ {
      fecha = $1 " " $2
      resto = $0; sub(/.*siguiente intento en /, "", resto); sub(/ s.*/, "", resto)
      if (fecha >= corte) s += resto + 0
    }
    END { print s + 0 }' "$log" 2>/dev/null || echo 0)"

  # El motivo va en la MISMA línea que la pausa, después de la marca ISO. Ojo: no se puede cortar con
  # `[^.]*`, porque el primer punto está DENTRO de la marca ISO (2026-09-23T23:06:52.615Z) y el motivo
  # desaparecía dejando sólo la fecha. Se toma la línea entera y se quita el prefijo.
  motivo="$(grep -o 'Pausa global preventiva.*' "$log" 2>/dev/null | sed 's/^Pausa global preventiva hasta [^ ]* *//' | sed 's/^por //' | sort | uniq -c | sort -rn | head -1 | sed 's/^ *[0-9]* *//' | cut -c1-46)"

  printf '%-22s %8s %8s %10s  %s\n' "$fed" "${pausas:-0}" "${sesiones:-0}" "${perdidos:-0}" "${motivo:-—}"
done

echo
echo "«SEG.PERDIDOS» suma los segundos que el propio worker declara de espera tras terminar una sesión"
echo "(«siguiente intento en N s»), es decir el tiempo en que la federación no está recolectando nada."
