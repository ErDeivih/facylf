#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════════════════════════════════
#  BLINDAJE DEL SERVIDOR CONTRA LAS CAÍDAS "EN SECO"  (Claude, 14/10/2026)
# ══════════════════════════════════════════════════════════════════════════════════════════════════════════
#
# Por qué existe. El servidor se ha caído tres veces (11/10 ~23:14 UTC, 13/10 18:06 UTC, 14/10 01:18 UTC) y
# las tres acaban igual: el diario se corta en mitad de líneas normales, sin OOM, sin "hung task", sin errores
# de disco, sin apagado ordenado. La tercera fue SIN traídas encima: basta la flota sola. Con la flota la carga
# es 14-23 en 4 núcleos, la presión de CPU ronda el 90 % y la de E/S el 66-90 %: el sistema (sshd, journald,
# el propio kernel) compite en igualdad con los navegadores y no le queda aire.
#
# Qué hace (todo reversible; nada borra datos ni toca colas):
#
#   1. RESERVA AIRE PARA EL SISTEMA. `facylf.slice` pasa de "sin límite de CPU" a:
#        CPUQuota=300%  (de 400 %: deja un hilo entero libre para el sistema)
#        CPUWeight=50   (si hay pelea, el sistema gana a los navegadores)
#        IOWeight=50    (ídem con el disco)
#        MemoryHigh=11G (empieza a recuperar memoria antes de chocar con MemoryMax=12G)
#      Se aplica en caliente y queda escrito en /etc/systemd/system/facylf.slice.d/blindaje.conf.
#      Coste: la recolección va algo más lenta (≈ 15-20 % menos CPU como máximo) y el portátil se calienta menos.
#      Ajustable con FACYLF_CPU_CUOTA=340% si se ve que sobra aire.
#
#   2. SI SE CUELGA, QUE SE REINICIE SOLO (en vez de quedarse muerto hasta que alguien lo vea):
#        kernel.panic=10            → tras un pánico, reinicia a los 10 s
#        kernel.panic_on_oops=1     → un "oops" del kernel cuenta como pánico
#        kernel.softlockup_panic=1  → un núcleo bloqueado >20 s cuenta como pánico
#        kernel.hardlockup_panic=1  → un núcleo bloqueado sin interrupciones (NMI) cuenta como pánico
#        kernel.nmi_watchdog=1      → el vigilante que detecta lo anterior
#        vm.swappiness=10           → menos intercambio con disco bajo presión
#      En /etc/sysctl.d/90-facylf-blindaje.conf.
#      Los contenedores vuelven solos tras el reinicio (`restart: unless-stopped`).
#
#   3. VIGILANTE DE SYSTEMD. Si hay un vigilante de hardware (/dev/watchdog de la placa: iTCO, sp5100…), systemd
#      lo "alimenta" cada pocos segundos; si la máquina se congela del todo y deja de alimentarlo, la PLACA la
#      reinicia. Es lo único que salva un cuelgue duro de verdad. Si no hay vigilante de hardware se carga
#      `softdog` (de software: cubre cuelgues del sistema, no del hardware).
#      En /etc/systemd/system.conf.d/facylf-vigilante.conf (+ /etc/modules-load.d/facylf-softdog.conf si hace falta).
#
#   4. HISTORIAL. Instala `sysstat` y lo pone a muestrear cada minuto, para que la próxima caída deje constancia
#      de carga, memoria, E/S y temperatura (si `lm-sensors`) en los minutos de antes. Se omite con --sin-apt.
#
#   5. TEMPERATURA. Un temporizador de systemd apunta cada minuto temperatura, frecuencia y carga en
#      /var/log/facylf-temperatura.log (se recorta solo a ~3 días), para ver si la caída llega con calor.
#
# La máquina es un PORTÁTIL (Lenovo G50-80, i5-5200U: 2 núcleos / 4 hilos, de bajo consumo) a plena carga 24 h.
# Lo que NO puede hacer un script: limpiar el ventilador y la rejilla, y levantarlo o ponerle base con
# ventilación. Si al ir a mirarlo aparece APAGADO (sin luces) y no colgado, apunta a calor o al cargador: el
# vigilante de 3 sólo salva un cuelgue con la máquina encendida.
#
# Uso (como root, en el servidor):
#   sudo bash blindaje-servidor.sh             # SECO: dice qué haría y cómo está ahora, no toca nada
#   sudo bash blindaje-servidor.sh --aplicar   # lo aplica
#   sudo bash blindaje-servidor.sh --aplicar --sin-apt
#   sudo bash blindaje-servidor.sh --deshacer  # quita todo lo que pone este script
set -uo pipefail

APLICAR=0; DESHACER=0; APT=1
for a in "$@"; do
  case "$a" in
    --aplicar) APLICAR=1 ;;
    --deshacer) DESHACER=1; APLICAR=1 ;;
    --sin-apt) APT=0 ;;
    *) echo "opción no reconocida: $a"; exit 1 ;;
  esac
done
[ "$(id -u)" = "0" ] || { echo "hay que ejecutarlo como root (sudo)"; exit 1; }

CPU_CUOTA=${FACYLF_CPU_CUOTA:-300%}
MEM_ALTA=${FACYLF_MEMORIA_ALTA:-11G}
VIGILANTE_SEG=${FACYLF_VIGILANTE_SEG:-30}
SLICE_CONF=/etc/systemd/system/facylf.slice.d/blindaje.conf
SYSCTL_CONF=/etc/sysctl.d/90-facylf-blindaje.conf
VIGILANTE_CONF=/etc/systemd/system.conf.d/facylf-vigilante.conf
SOFTDOG_CONF=/etc/modules-load.d/facylf-softdog.conf
SELLO=$(date '+%F-%H%M')
REGISTRO="/var/log/facylf-blindaje-$SELLO.log"
exec > >(tee -a "$REGISTRO") 2>&1

haz() { if [ "$APLICAR" = "1" ]; then echo "  + $*"; "$@"; else echo "  [seco] $*"; fi; }
escribe() {  # escribe <fichero> <contenido>
  if [ "$APLICAR" = "1" ]; then mkdir -p "$(dirname "$1")"; printf '%s\n' "$2" > "$1"; echo "  + escrito $1";
  else echo "  [seco] escribiría $1:"; printf '%s\n' "$2" | sed 's/^/        /'; fi
}

echo "════════════════════════════════════════════════════════════════════════"
echo "  facylf · blindaje del servidor · $(date '+%F %T')"
[ "$APLICAR" = "0" ] && echo "  MODO SECO: no se cambia nada (repite con --aplicar)"
[ "$DESHACER" = "1" ] && echo "  DESHACIENDO"
echo "  registro: $REGISTRO"
echo "════════════════════════════════════════════════════════════════════════"

# ── deshacer ─────────────────────────────────────────────────────────────────────────────────────────────
if [ "$DESHACER" = "1" ]; then
  systemctl disable --now facylf-temperatura.timer 2>/dev/null
  rm -f "$SLICE_CONF" "$SYSCTL_CONF" "$VIGILANTE_CONF" "$SOFTDOG_CONF" /etc/systemd/system/facylf-temperatura.* /usr/local/sbin/facylf-temperatura
  systemctl set-property --runtime facylf.slice CPUQuota= CPUWeight= IOWeight= MemoryHigh=infinity 2>/dev/null
  sysctl -w kernel.panic=0 kernel.panic_on_oops=0 kernel.softlockup_panic=0 kernel.hardlockup_panic=0 vm.swappiness=60 >/dev/null 2>&1
  systemctl daemon-reload; systemctl daemon-reexec
  echo "  quitado. sysstat se deja instalado (apt remove sysstat si se quiere)."
  exit 0
fi

# ── 0 · cómo está ────────────────────────────────────────────────────────────────────────────────────────
echo; echo "── 0 · cómo está ahora ──"
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg) · núcleos: $(nproc)"
echo "  presión CPU: $(head -1 /proc/pressure/cpu) · E/S: $(head -1 /proc/pressure/io)"
systemctl show facylf.slice -p CPUQuotaPerSecUSec -p CPUWeight -p IOWeight -p MemoryHigh -p MemoryMax -p MemoryCurrent 2>/dev/null | sed 's/^/  /'
for k in kernel.panic kernel.panic_on_oops kernel.softlockup_panic kernel.hardlockup_panic kernel.nmi_watchdog vm.swappiness; do
  echo "  $k = $(sysctl -n $k 2>/dev/null || echo 'no existe')"; done
echo "  vigilante de hardware: $(ls /dev/watchdog* 2>/dev/null | paste -sd' ' || true) $(cat /sys/class/watchdog/watchdog0/identity 2>/dev/null || echo '(ninguno identificado)')"
systemctl show -p RuntimeWatchdogUSec 2>/dev/null | sed 's/^/  systemd /'

# ── 1 · aire para el sistema ─────────────────────────────────────────────────────────────────────────────
echo; echo "── 1 · facylf.slice: CPUQuota=$CPU_CUOTA CPUWeight=50 IOWeight=50 MemoryHigh=$MEM_ALTA ──"
haz systemctl set-property --runtime facylf.slice CPUQuota="$CPU_CUOTA" CPUWeight=50 IOWeight=50 MemoryHigh="$MEM_ALTA"
escribe "$SLICE_CONF" "[Slice]
CPUQuota=$CPU_CUOTA
CPUWeight=50
IOWeight=50
MemoryHigh=$MEM_ALTA"
[ "$APLICAR" = "1" ] && systemctl daemon-reload

# ── 2 · reinicio automático ante pánico o bloqueo ───────────────────────────────────────────────────────
echo; echo "── 2 · reinicio automático ante pánico o bloqueo ──"
escribe "$SYSCTL_CONF" "# facylf · blindaje ($SELLO): si el kernel se bloquea, reiniciar solo en vez de quedarse muerto
kernel.panic = 10
kernel.panic_on_oops = 1
kernel.softlockup_panic = 1
kernel.hardlockup_panic = 1
kernel.nmi_watchdog = 1
vm.swappiness = 10"
[ "$APLICAR" = "1" ] && sysctl -p "$SYSCTL_CONF" 2>&1 | sed 's/^/    /'

# ── 3 · vigilante de systemd ─────────────────────────────────────────────────────────────────────────────
echo; echo "── 3 · vigilante ──"
if [ ! -e /dev/watchdog0 ] && [ ! -e /dev/watchdog ]; then
  echo "  no hay /dev/watchdog: se intenta el de la placa (iTCO_wdt / sp5100_tco) y, si no, softdog"
  if [ "$APLICAR" = "1" ]; then
    MODULO=""
    for m in iTCO_wdt sp5100_tco softdog; do
      modprobe "$m" 2>/dev/null; sleep 1
      [ -e /dev/watchdog0 ] && { MODULO=$m; break; }
    done
    if [ -n "$MODULO" ]; then
      escribe "$SOFTDOG_CONF" "$MODULO"
      echo "  vigilante cargado: $MODULO ($(cat /sys/class/watchdog/watchdog0/identity 2>/dev/null))"
    else
      echo "  AVISO: no se pudo cargar ningún vigilante; el resto del blindaje sigue valiendo"
    fi
  else
    echo "  [seco] modprobe iTCO_wdt || modprobe sp5100_tco || modprobe softdog (y lo dejaría en $SOFTDOG_CONF)"
  fi
else
  echo "  ya hay vigilante: $(cat /sys/class/watchdog/watchdog0/identity 2>/dev/null)"
fi
escribe "$VIGILANTE_CONF" "[Manager]
RuntimeWatchdogSec=${VIGILANTE_SEG}s
RebootWatchdogSec=2min"
if [ "$APLICAR" = "1" ]; then
  systemctl daemon-reexec
  echo "  systemd: $(systemctl show -p RuntimeWatchdogUSec --value)"
fi

# ── 4 · historial ────────────────────────────────────────────────────────────────────────────────────────
echo; echo "── 4 · historial (sysstat cada minuto) ──"
if [ "$APT" = "0" ]; then echo "  omitido (--sin-apt)";
elif command -v sar >/dev/null 2>&1 && systemctl is-enabled sysstat >/dev/null 2>&1; then echo "  ya está";
else
  haz env DEBIAN_FRONTEND=noninteractive apt-get install -y -q sysstat lm-sensors
  if [ "$APLICAR" = "1" ]; then
    sed -i 's/^ENABLED=.*/ENABLED="true"/' /etc/default/sysstat 2>/dev/null
    mkdir -p /etc/systemd/system/sysstat-collect.timer.d
    printf '[Timer]\nOnCalendar=\nOnCalendar=*:*:00\n' > /etc/systemd/system/sysstat-collect.timer.d/cada-minuto.conf
    systemctl daemon-reload; systemctl enable --now sysstat sysstat-collect.timer 2>&1 | sed 's/^/    /'
  fi
fi

# ── 4b · registro de temperatura ─────────────────────────────────────────────────────────────────────────
echo; echo "── 4b · registro de temperatura cada minuto ──"
escribe /usr/local/sbin/facylf-temperatura "#!/bin/sh
# una línea por minuto: hora, temperatura del paquete, MHz medios, carga, batería y cargador
L=/var/log/facylf-temperatura.log
T=\$(cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | sort -n | tail -1)
M=\$(awk '/MHz/ {s+=\$4; n++} END {if (n) printf \"%d\", s/n}' /proc/cpuinfo)
B=\$(cat /sys/class/power_supply/BAT0/capacity 2>/dev/null); E=\$(cat /sys/class/power_supply/BAT0/status 2>/dev/null); A=\$(cat /sys/class/power_supply/ADP0/online 2>/dev/null)
echo \"\$(date '+%F %T') \$((T/1000))C \${M}MHz carga \$(cut -d' ' -f1-3 /proc/loadavg) bateria \${B}% \${E} cargador \${A}\" >> \$L
[ \$(wc -l < \$L) -gt 5000 ] && tail -n 4320 \$L > \$L.tmp && mv \$L.tmp \$L
exit 0"
escribe /etc/systemd/system/facylf-temperatura.service "[Unit]
Description=facylf: apunta temperatura y carga
[Service]
Type=oneshot
ExecStart=/bin/sh /usr/local/sbin/facylf-temperatura"
escribe /etc/systemd/system/facylf-temperatura.timer "[Unit]
Description=facylf: temperatura cada minuto
[Timer]
OnCalendar=*:*:30
AccuracySec=5s
[Install]
WantedBy=timers.target"
if [ "$APLICAR" = "1" ]; then systemctl daemon-reload; systemctl enable --now facylf-temperatura.timer 2>&1 | sed 's/^/    /'; fi

# ── 5 · comprobación ─────────────────────────────────────────────────────────────────────────────────────
echo; echo "── 5 · cómo queda ──"
systemctl show facylf.slice -p CPUQuotaPerSecUSec -p CPUWeight -p IOWeight -p MemoryHigh -p MemoryMax 2>/dev/null | sed 's/^/  /'
for k in kernel.panic kernel.softlockup_panic kernel.hardlockup_panic vm.swappiness; do echo "  $k = $(sysctl -n $k 2>/dev/null)"; done
echo "  vigilante: $(cat /sys/class/watchdog/watchdog0/identity 2>/dev/null || echo ninguno) · systemd $(systemctl show -p RuntimeWatchdogUSec --value 2>/dev/null)"
echo
echo "── falta a mano ──"
echo "  · ventilador y rejilla limpios; el portátil levantado o en base con ventilación"
echo "  · temperatura: tail /var/log/facylf-temperatura.log"
echo "── deshacer ──"
echo "  sudo bash blindaje-servidor.sh --deshacer"
echo "  registro: $REGISTRO"
