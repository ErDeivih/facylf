#!/bin/bash
# ── ¿SE ESTÁ VACIANDO LA BATERÍA CON EL CARGADOR PUESTO? ────────────────────────────────────────────────
#
# Esta es la comprobación que decide si el servidor se apaga solo por corriente o por software. Se toman varias
# muestras separadas en el tiempo (una sola no dice nada: los contadores de energía del núcleo tienen ruido) y se
# calcula la pendiente y la potencia.
#
# Si la energía BAJA con el adaptador «online», el portátil no está tirando de la corriente: está tirando de la
# batería. Y entonces el apagado no es un fallo de configuración —que es lo que se puede arreglar por software—
# sino que la corriente no llega. Y llega el día en que la batería se acaba, y ese día la máquina se apaga de
# golpe: sin secuencia de apagado en el diario y con `wtmp` apuntando «crash».
#
# Uso:  bash mide-bateria.sh [muestras] [segundos_entre_muestras]
set -u
muestras="${1:-6}"
espera="${2:-60}"
bat="/sys/class/power_supply/BAT0"
adp="/sys/class/power_supply/ADP0"

leer() { cat "$1" 2>/dev/null || echo 0; }

echo "adaptador online : $(leer "$adp/online")   (1 = enchufado, 0 = desenchufado)"
echo "estado batería   : $(leer "$bat/status")"
echo "carga            : $(leer "$bat/capacity") %"
echo "carga completa   : $(leer "$bat/energy_full") µWh de $(leer "$bat/energy_full_design") µWh de fábrica"
echo "--- límites de carga que pudiera tener puestos (si existen, no cargar al 100 % es a propósito) ---"
for f in charge_control_end_threshold charge_control_start_threshold charge_behaviour charge_stop_threshold; do
  [ -f "$bat/$f" ] && echo "  $f = $(leer "$bat/$f")"
done
[ -d "$bat" ] || { echo "no hay BAT0"; exit 1; }

echo
echo "--- $muestras muestras cada ${espera}s ---"
inicial="$(leer "$bat/energy_now")"
anterior="$inicial"
inicio="$(date +%s)"
for i in $(seq 1 "$muestras"); do
  sleep "$espera"
  ahora="$(leer "$bat/energy_now")"
  marca="$(date +%H:%M:%S)"
  printf '  %s  %s µWh  (capacidad %s %%)\n' "$marca" "$ahora" "$(leer "$bat/capacity")"
  anterior="$ahora"
done
fin="$(date +%s)"
transcurrido=$((fin - inicio))
delta=$((anterior - inicial))
echo
echo "en $transcurrido s la energía ha cambiado $delta µWh"
if [ "$transcurrido" -gt 0 ]; then
  vatios="$(awk -v d="$delta" -v t="$transcurrido" 'BEGIN { printf "%.2f", (d / 1000000.0) * 3600.0 / t }')"
  resto="$(awk -v e="$anterior" -v d="$delta" -v t="$transcurrido" 'BEGIN { if (d >= 0) print "no se vacía"; else printf "%.1f", (e / (-d)) * t / 3600.0 }')"
  echo "potencia neta: $vatios W  (negativo = se vacía)"
  if [ "$delta" -lt 0 ]; then
    echo "→ SE VACÍA. Al ritmo medido, la batería daría para unas $resto horas más."
    echo "  El adaptador está «online» pero no mantiene la carga: revisa cargador, cable y conector."
  elif [ "$delta" -gt 0 ]; then
    echo "→ CARGA. La corriente llega y el adaptador repone."
  else
    echo "→ ESTABLE."
  fi
  echo
  echo "carga del sistema en estas muestras: $(cut -d' ' -f1-3 /proc/loadavg)"
fi
