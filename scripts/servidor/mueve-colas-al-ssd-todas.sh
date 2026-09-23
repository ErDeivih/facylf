#!/usr/bin/env bash
# ── MUEVE LAS COLAS DE TODAS LAS FEDERACIONES AL SSD, DE UNA EN UNA ──────────────────────────────────────
#
# Hace lo mismo que `mueve-cola-al-ssd.sh` pero para toda la flota, federación a federación y comprobando cada
# una antes de pasar a la siguiente. Va de una en una a propósito: si algo saliera mal, se ve en qué federación
# y las demás siguen funcionando.
#
# Cada federación se para unos segundos (lo que tarda copiar su cola, unos 400-500 MB), se comprueba la copia
# con `quick_check` y sólo entonces se pone el enlace y se recrea el contenedor.
#
# Deja un informe en /tmp/migracion-ssd.txt.
#
# Uso: bash scripts/servidor/mueve-colas-al-ssd-todas.sh [federación…]
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
INFORME=${FACYLF_INFORME:-/tmp/migracion-ssd.txt}

FEDS=("$@")
if [ "${#FEDS[@]}" -eq 0 ]; then
  FEDS=(andalucia aragon asturias baleares cantabria castilla-la-mancha cataluna extremadura federacion
        galicia madrid melilla murcia navarra rioja valencia)
fi

{
  echo "migración de colas al SSD · $(date '+%F %T')"
  echo
} > "$INFORME"

for fed in "${FEDS[@]}"; do
  echo "════ $fed ════" | tee -a "$INFORME"

  # 1. Copiar y enlazar (el propio guion comprueba la copia con quick_check antes de cambiar nada).
  if ! bash "$RAIZ/scripts/servidor/mueve-cola-al-ssd.sh" "$fed" >> "$INFORME" 2>&1; then
    echo "  ✗ la copia o el enlace fallaron: se deja como estaba" | tee -a "$INFORME"
    continue
  fi

  # 2. Recrear el contenedor para que coja el montaje del SSD (ya va en el ancla del compose).
  if bash "$RAIZ/scripts/servidor/aplica-turnos.sh" "$fed" > /dev/null 2>&1; then
    echo "  ✓ contenedor recreado" | tee -a "$INFORME"
  else
    echo "  ✗ no se pudo recrear el contenedor" | tee -a "$INFORME"
    continue
  fi

  # 3. Comprobar que ARRANCA y que ve su cola a través del enlace.
  sleep 25
  if docker exec "facylf-$fed-1" test -r /app/descargas-"$fed"/recolector-local/cola-v2.sqlite 2>/dev/null; then
    echo "  ✓ la cola se lee a través del enlace" | tee -a "$INFORME"
  else
    echo "  ✗ el contenedor NO puede leer la cola; revísalo" | tee -a "$INFORME"
  fi
  echo | tee -a "$INFORME"
done

echo "terminado · informe en $INFORME"
