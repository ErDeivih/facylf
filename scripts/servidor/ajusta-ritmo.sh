#!/usr/bin/env bash
# ── AJUSTA EL RITMO DE LA FLOTA DEL SERVIDOR ────────────────────────────────────────────────────────────
#
# El procesador del servidor es viejo y no es sólo nuestro: RadioPV y el sistema viven en la misma máquina.
# Medido el 21/09/2026 con las 19 federaciones en marcha: facylf 2,64 núcleos + radiopv-collector 1,19 sobre 4
# núcleos, carga 41 y 2 140 hilos. No es que se pare, es que no se le puede pedir más a ese procesador.
#
# Esto baja las DOS palancas que de verdad cuentan:
#
#   · **cuántos navegadores a la vez** (`FACYLF_MEMORIA_GB`): las plazas salen de la aritmética del gobernador
#     (`(memoria - 1,5) / 0,75`), así que 10 GB son 11 plazas y 6 GB son 6. Menos plazas, menos navegadores
#     abiertos, menos peticiones por minuto.
#   · **cuánto puede apretar cada uno** (`cpus` por federación): lo reparte `calcula-turnos.mjs`.
#
# Uso:
#   bash scripts/servidor/ajusta-ritmo.sh                          # dice cómo está, no toca nada
#   bash scripts/servidor/ajusta-ritmo.sh --memoria-gb 6 --cpu-defecto 0.4
#   bash scripts/servidor/ajusta-ritmo.sh --memoria-gb 8           # subir otra vez
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
ENV="$RAIZ/docker/.env"
MEMORIA=""
CPU_DEFECTO=""
CPU_IMPORTADOR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --memoria-gb) MEMORIA="$2"; shift 2 ;;
    --cpu-defecto) CPU_DEFECTO="$2"; shift 2 ;;
    # El importador también tiene cuota: un grupo grande (22 000 filas) se lleva casi un núcleo entero
    # mientras lo resuelve, y con 19 recolectores detrás conviene que no se lo quede todo.
    --cpu-importador) CPU_IMPORTADOR="$2"; shift 2 ;;
    *) echo "opción no reconocida: $1"; exit 1 ;;
  esac
done

[ -f "$ENV" ] || { echo "no existe $ENV"; exit 1; }

# Pone o cambia una clave sin tocar el resto del fichero ni duplicarla.
pon() {
  local clave="$1" valor="$2"
  if grep -qE "^${clave}=" "$ENV"; then
    sed -i -E "s|^${clave}=.*|${clave}=${valor}|" "$ENV"
  else
    printf '\n# Puesto por scripts/servidor/ajusta-ritmo.sh el %s\n%s=%s\n' "$(date '+%F %H:%M')" "$clave" "$valor" >> "$ENV"
  fi
}

echo "── antes ──"
grep -E '^FACYLF_(MEMORIA_GB|RESERVA_GB|CPUS_)' "$ENV" | sed 's/^/  /' || true

if [ -z "$MEMORIA" ] && [ -z "$CPU_DEFECTO" ] && [ -z "$CPU_IMPORTADOR" ]; then
  echo
  echo "── plazas que salen de esa memoria ──"
  actual=$(grep -E '^FACYLF_MEMORIA_GB=' "$ENV" | cut -d= -f2)
  reserva=$(grep -E '^FACYLF_RESERVA_GB=' "$ENV" | cut -d= -f2); reserva=${reserva:-1.5}
  awk -v m="${actual:-10}" -v r="$reserva" 'BEGIN { printf "  memoria %s GB − reserva %s GB = %.2f GB para navegadores → %d plazas de 0,75 GB\n", m, r, m - r, int((m - r) / 0.75) }'
  echo
  echo "  para bajarlas:  bash scripts/servidor/ajusta-ritmo.sh --memoria-gb 6 --cpu-defecto 0.4"
  exit 0
fi

[ -n "$MEMORIA" ] && pon FACYLF_MEMORIA_GB "$MEMORIA"
[ -n "$CPU_DEFECTO" ] && pon FACYLF_CPUS_POR_RECOLECTOR "$CPU_DEFECTO"
[ -n "$CPU_IMPORTADOR" ] && pon FACYLF_CPUS_IMPORTADOR "$CPU_IMPORTADOR"

echo "── después ──"
grep -E '^FACYLF_(MEMORIA_GB|RESERVA_GB|CPUS_)' "$ENV" | sed 's/^/  /'
m=$(grep -E '^FACYLF_MEMORIA_GB=' "$ENV" | cut -d= -f2)
awk -v m="$m" 'BEGIN { printf "  → %d plazas de navegador a la vez\n", int((m - 1.5) / 0.75) }'
echo
echo "  el .env sólo se lee al recrear los contenedores: aplícalo con"
echo "    bash scripts/servidor/aplica-turnos.sh"
