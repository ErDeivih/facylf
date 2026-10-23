#!/bin/bash
# Instala la guardia de energía (guardia-energia.sh) y RETIRA la guardia de batería anterior.
#
#   sudo bash instala-guardia-energia.sh                     → sólo enseña lo que haría
#   sudo bash instala-guardia-energia.sh --aplicar           → instala y arranca
#   sudo bash instala-guardia-energia.sh --aplicar --carga-completa
#        además quita el modo conservación de Lenovo (la batería carga hasta el 100 % en vez de pararse en
#        ~60 %): con un cargador que no da para todo, es casi el doble de colchón antes de apagarse. Gasta
#        algo más la batería, que ya está degradada; decisión de David.
#   sudo bash instala-guardia-energia.sh --deshacer          → lo quita todo y deja 250 %, turbo y frecuencia normales
set -u
AQUI=$(cd "$(dirname "$0")" && pwd)
APLICAR=0; DESHACER=0; COMPLETA=0
for a in "$@"; do case "$a" in --aplicar) APLICAR=1 ;; --deshacer) DESHACER=1; APLICAR=1 ;; --carga-completa) COMPLETA=1 ;; esac; done
haz() { if [ "$APLICAR" = 1 ]; then echo "  + $*"; eval "$@"; else echo "  (haría) $*"; fi; }
P=/sys/devices/system/cpu/intel_pstate
CONS=$(ls /sys/bus/platform/drivers/ideapad_acpi/*/conservation_mode 2>/dev/null | head -1)

if [ "$DESHACER" = 1 ]; then
  haz "systemctl disable --now facylf-guardia-energia.timer"
  haz "rm -f /etc/systemd/system/facylf-guardia-energia.service /etc/systemd/system/facylf-guardia-energia.timer /usr/local/sbin/facylf-guardia-energia"
  haz "systemctl daemon-reload"
  haz "systemctl set-property --runtime facylf.slice CPUQuota=250%"
  [ -w "$P/no_turbo" ] && haz "echo 0 > $P/no_turbo"
  [ -w "$P/max_perf_pct" ] && haz "echo 100 > $P/max_perf_pct"
  for c in /sys/devices/system/cpu/cpu[0-9]*/cpufreq; do haz "cat $c/cpuinfo_max_freq > $c/scaling_max_freq"; done
  [ -s /var/lib/facylf-guardia/parados ] && haz "docker start \$(cat /var/lib/facylf-guardia/parados)"
  haz "rm -rf /run/facylf-guardia /var/lib/facylf-guardia"
  [ -n "$CONS" ] && haz "echo 1 > $CONS"
  exit 0
fi

echo "── lo que ve ahora ──"
for f in /sys/class/power_supply/BAT*/{capacity,status,energy_now,energy_full,energy_full_design,power_now} /sys/class/power_supply/ADP*/online "$P/no_turbo" "$P/max_perf_pct" $CONS; do
  [ -r "$f" ] && echo "  $f = $(cat "$f")"
done
echo "  rtcwake: $(command -v rtcwake || echo 'NO ESTÁ (el apagado limpio no podrá despertarse solo)')"
systemctl show facylf.slice -p CPUQuotaPerSecUSec | sed 's/^/  /'

echo "── 1 · se retira la guardia de batería anterior ──"
haz "systemctl disable --now facylf-guardia-bateria.timer 2>/dev/null || true"

echo "── 2 · guardia de energía ──"
haz "install -m 755 '$AQUI/guardia-energia.sh' /usr/local/sbin/facylf-guardia-energia"
haz "cat > /etc/systemd/system/facylf-guardia-energia.service <<'U'
[Unit]
Description=facylf - guardia de energia (tendencia de la bateria, turbo, techo de CPU, apagado limpio)
[Service]
Type=oneshot
TimeoutStartSec=300
ExecStart=/bin/sh /usr/local/sbin/facylf-guardia-energia
U"
haz "cat > /etc/systemd/system/facylf-guardia-energia.timer <<'U'
[Unit]
Description=facylf - guardia de energia cada minuto
[Timer]
OnBootSec=1min
OnUnitActiveSec=1min
AccuracySec=5s
[Install]
WantedBy=timers.target
U"
haz "systemctl daemon-reload"
haz "systemctl enable --now facylf-guardia-energia.timer"

if [ "$COMPLETA" = 1 ]; then
  echo "── 3 · carga completa (sin modo conservación) ──"
  if [ -n "$CONS" ]; then haz "echo 0 > $CONS"
    haz "echo 'w $CONS - - - - 0' > /etc/tmpfiles.d/facylf-carga-completa.conf"
  else echo "  no hay conservation_mode (ideapad_acpi): no se toca"; fi
fi

if [ "$APLICAR" = 1 ]; then
  sleep 3
  echo "── comprobación ──"
  systemctl is-active facylf-guardia-energia.timer | sed 's/^/  temporizador: /'
  systemctl is-enabled facylf-guardia-bateria.timer 2>/dev/null | sed 's/^/  guardia vieja: /'
  echo "  turbo apagado (no_turbo): $(cat $P/no_turbo 2>/dev/null)"
  echo "  escalón: $(cat /run/facylf-guardia/nivel 2>/dev/null)"
  tail -3 /var/log/facylf-guardia.log 2>/dev/null | sed 's/^/  /'
fi
