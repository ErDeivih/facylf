#!/bin/bash
# ── ¿POR QUÉ SE APAGA ESTE SERVIDOR? ────────────────────────────────────────────────────────────────────
#
# No es la primera vez que el servidor aparece apagado sin que nadie lo apague. Medido el 30/09/2026: se le vio
# por última vez a las 20:02:45 del 29/09 y estuvo caído 14 horas. Antes de tocar nada hay que descartar, una por
# una, TODAS las formas conocidas de que una máquina Linux se apague sola, porque el síntoma es el mismo y la
# causa cambia mucho el arreglo:
#
#   · apagado ordenado pedido por software  -> systemd, cron, un temporizador, unattended-upgrades
#   · apagado por calor                     -> thermal_zone, throttling, temperatura alta
#   · apagado por batería o SAI            -> NUT / apcupsd / upower
#   · apagado por el botón o la tapa        -> logind (HandlePowerKey, HandleLidSwitch)
#   · reinicio por watchdog                 -> systemd RuntimeWatchdogSec, hardware watchdog
#   · corte de corriente                     -> NO deja rastro en los registros: el diario se corta en seco
#
# Esa última distinción es la importante: si el diario del arranque anterior TERMINA en una secuencia ordenada
# («Stopping...», «Reached target Shutdown», «systemd-shutdown»), alguien o algo lo apagó a propósito. Si termina
# a mitad de una frase y sin secuencia de apagado, fue la corriente (o un cuelgue del núcleo).
#
# Uso:  bash diagnostica-apagados.sh
set -u

echo "════════════════════════════════════════════════════════════════════════════════"
echo " 1 · ESTADO AHORA"
echo "════════════════════════════════════════════════════════════════════════════════"
uptime
echo "arrancado en: $(uptime -s)"
echo "encendido desde: $(who -b 2>/dev/null || echo 'sin dato de who')"
echo "hora ahora: $(date '+%F %T %Z')"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 2 · ARRANQUES ANTERIORES Y CUÁNDO TERMINÓ CADA UNO"
echo "════════════════════════════════════════════════════════════════════════════════"
journalctl --list-boots --no-pager 2>/dev/null | tail -8

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 3 · ¿EL ARRANQUE ANTERIOR SE APAGÓ ORDENADAMENTE O SE CORTÓ?"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "--- últimas 25 líneas del arranque ANTERIOR ---"
journalctl -b -1 -n 25 --no-pager 2>/dev/null
echo
echo "--- secuencia de apagado en el arranque ANTERIOR (si aparece, fue ordenado) ---"
journalctl -b -1 --no-pager 2>/dev/null |
  grep -iE 'Reached target (Shutdown|Power-Off|Reboot)|systemd-shutdown|Stopping .*Shutdown|Powering off|A stop job' |
  tail -15
echo "(si no hay nada arriba, el diario se cortó sin secuencia de apagado)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 4 · ERRORES DEL ARRANQUE ANTERIOR (justo antes de morir)"
echo "════════════════════════════════════════════════════════════════════════════════"
journalctl -b -1 -p err --no-pager 2>/dev/null | tail -25

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 5 · SEÑALES DE APAGADO: BOTÓN, TAPA, ACPI, TÉRMICA, WATCHDOG"
echo "════════════════════════════════════════════════════════════════════════════════"
journalctl -b -1 --no-pager 2>/dev/null |
  grep -iE 'power button|power key|lid|ACPI|thermal|temperature|throttl|watchdog|critical|hardware error|mce|over.?temp' |
  tail -20
echo "(sin líneas aquí = nada pidió el apagado por estas vías)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 6 · TEMPORIZADORES PROGRAMADOS (systemd timers)"
echo "════════════════════════════════════════════════════════════════════════════════"
systemctl list-timers --all --no-pager 2>/dev/null | head -20

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 7 · CRON Y TAREAS PROGRAMADAS"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "--- crontab de root ---"
crontab -l -u root 2>/dev/null || echo "(sin crontab de root)"
echo "--- /etc/crontab ---"
cat /etc/crontab 2>/dev/null | grep -vE '^\s*#|^\s*$' || true
echo "--- /etc/cron.d ---"
ls -la /etc/cron.d/ 2>/dev/null
for f in /etc/cron.d/*; do
  [ -f "$f" ] && { echo "· $f:"; grep -vE '^\s*#|^\s*$' "$f"; }
done 2>/dev/null
echo "--- ¿algo que apague, reinicie o suspenda, en cualquier sitio de /etc? ---"
grep -rIlE '(shutdown|poweroff|halt|reboot|systemctl (poweroff|halt|suspend))' /etc/cron* /etc/systemd/system 2>/dev/null |
  head -20 || echo "(nada)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 8 · ACTUALIZACIONES AUTOMÁTICAS (reinician solas si están mal configuradas)"
echo "════════════════════════════════════════════════════════════════════════════════"
for f in /etc/apt/apt.conf.d/50unattended-upgrades /etc/apt/apt.conf.d/20auto-upgrades; do
  if [ -f "$f" ]; then
    echo "· $f:"
    grep -vE '^\s*//|^\s*$' "$f" | head -12
  fi
done
systemctl is-enabled unattended-upgrades 2>/dev/null || echo "unattended-upgrades no instalado o no habilitado"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 9 · QUÉ HACE EL SISTEMA CON EL BOTÓN Y LA TAPA (logind)"
echo "════════════════════════════════════════════════════════════════════════════════"
grep -vE '^\s*#|^\s*$' /etc/systemd/logind.conf 2>/dev/null || echo "(logind.conf sin líneas activas: todo por defecto)"
loginctl show-session 2>/dev/null | head -3 || true
echo "--- ¿hay sesión de escritorio que pueda suspender? ---"
loginctl list-sessions --no-pager 2>/dev/null | head -5

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "10 · BATERÍA O SAI (una batería agotada apaga sin más)"
echo "════════════════════════════════════════════════════════════════════════════════"
ls /sys/class/power_supply/ 2>/dev/null && echo "(dispositivos de alimentación arriba)"
for d in /sys/class/power_supply/*/; do
  [ -f "$d/type" ] && echo "· $(basename "$d"): $(cat "$d/type" 2>/dev/null) $(cat "$d/status" 2>/dev/null)"
done 2>/dev/null
systemctl is-active nut-monitor apcupsd upower 2>/dev/null | paste -sd' '
echo "--- servicios de SAI instalados ---"
systemctl list-units --all --no-pager 2>/dev/null | grep -iE 'nut|apcupsd|ups' || echo "(ninguno)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "11 · WATCHDOG DEL NÚCLEO Y DE SYSTEMD"
echo "════════════════════════════════════════════════════════════════════════════════"
grep -iE 'RuntimeWatchdogSec|RebootWatchdogSec|ShutdownWatchdogSec' /etc/systemd/system.conf 2>/dev/null | grep -vE '^\s*#' || echo "(system.conf sin watchdog declarado)"
for w in /sys/class/watchdog/*/; do
  [ -f "$w/identity" ] && echo "· $(basename "$w"): $(cat "$w/identity" 2>/dev/null), timeout $(cat "$w/timeout" 2>/dev/null)"
done 2>/dev/null
dmesg 2>/dev/null | grep -iE 'watchdog|hardware watchdog' | tail -5 || echo "(sin datos de watchdog en dmesg)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "13 · ¿APAGADO ORDENADO O CORTE SECO? (registro de sesiones: wtmp)"
echo "════════════════════════════════════════════════════════════════════════════════"
# `last -x` es lo más concluyente que hay: un apagado ordenado deja una línea «shutdown» y un reinicio deja
# «reboot». Si entre el último arranque y el siguiente NO hay ninguna de las dos, la máquina no se apagó: se
# quedó sin corriente o se colgó. Ningún demonio puede borrar ese rastro.
last -x 2>/dev/null | head -25
echo
echo "--- ¿hay líneas de apagado o reinicio? ---"
last -x 2>/dev/null | grep -iE 'shutdown|reboot|runlevel' | head -12 || echo "(NINGUNA: la máquina no se apagó por software)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "14 · TODO LO QUE PASÓ EN LOS ÚLTIMOS MINUTOS ANTES DE MORIR"
echo "════════════════════════════════════════════════════════════════════════════════"
# Se lee del arranque ANTERIOR y con la ventana ampliada: si el diario se corta a una hora y la máquina siguió
# viva (lo dice Tailscale), esos minutos de silencio son justo el cadáver.
journalctl -b -1 --since "2026-09-29 19:50:00" --no-pager 2>/dev/null |
  grep -vE 'autodeploy-todos|radiopv|EN STANDBY|repos revisados' | tail -40

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "15 · LA BATERÍA, QUE ES LO QUE IMPORTA EN UN PORTÁTIL"
echo "════════════════════════════════════════════════════════════════════════════════"
# En un portátil, un corte de corriente NO apaga la máquina: tira de batería. Salvo que la batería esté
# agotada, y entonces el apagado es instantáneo y sin rastro — exactamente el síntoma que estamos viendo.
for d in /sys/class/power_supply/BAT*/; do
  [ -d "$d" ] || continue
  nombre="$(basename "$d")"
  echo "· $nombre"
  for dato in status capacity energy_now energy_full energy_full_design charge_now charge_full charge_full_design cycle_count voltage_now power_now technology; do
    [ -f "$d/$dato" ] && printf '    %-20s %s\n' "$dato" "$(cat "$d/$dato" 2>/dev/null)"
  done
  # La salud es lo que dice si la batería sirve: capacidad real frente a la de fábrica.
  if [ -f "$d/energy_full" ] && [ -f "$d/energy_full_design" ]; then
    real="$(cat "$d/energy_full")"; diseno="$(cat "$d/energy_full_design")"
    [ "$diseno" -gt 0 ] 2>/dev/null && echo "    salud               $(( real * 100 / diseno )) % de la capacidad de fábrica"
  fi
  if [ -f "$d/charge_full" ] && [ -f "$d/charge_full_design" ]; then
    real="$(cat "$d/charge_full")"; diseno="$(cat "$d/charge_full_design")"
    [ "$diseno" -gt 0 ] 2>/dev/null && echo "    salud               $(( real * 100 / diseno )) % de la capacidad de fábrica"
  fi
done
echo "--- ¿el sistema avisó de batería crítica alguna vez? ---"
journalctl --no-pager 2>/dev/null | grep -iE 'low battery|battery critical|critical battery|shutting down.*battery' | tail -10 || echo "(sin avisos de batería crítica)"
echo "--- eventos de corriente alterna (conectar/desconectar el cargador) ---"
journalctl -b -1 --no-pager 2>/dev/null | grep -iE 'ac_adapter|AC adapter|mains|on AC|off AC|power_supply' | tail -10 || echo "(sin eventos de corriente alterna registrados)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "16 · ¿HAY ESCRITORIO CON GESTOR DE ENERGÍA PROPIO?"
echo "════════════════════════════════════════════════════════════════════════════════"
# Un escritorio (GNOME, KDE, XFCE) puede suspender o apagar por su cuenta, y sus ajustes MANDAN sobre
# logind.conf para la sesión. Si hay escritorio, hay que mirar sus ajustes, no sólo los del sistema.
loginctl list-sessions --no-pager 2>/dev/null
for s in $(loginctl list-sessions --no-pager 2>/dev/null | awk 'NR>1 && $1 ~ /^[0-9]+$/ {print $1}'); do
  echo "· sesión $s:"
  loginctl show-session "$s" -p Id -p User -p Type -p Class -p Desktop -p Active -p Remote -p State 2>/dev/null | sed 's/^/    /'
done
echo "--- procesos de escritorio y de gestión de energía ---"
ps -eo comm 2>/dev/null | grep -iE 'gnome|plasma|xfce|lxqt|cinnamon|mate|budgie|sway|kwin|xfsettingsd|xfce4-power|gnome-settings' | sort -u || echo "(sin escritorio)"
echo "--- inhibidores de apagado activos (algo que impida dormir) ---"
systemd-inhibit --list 2>/dev/null || echo "(sin inhibidores)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "17 · CARGAS Y SEÑALES JUSTO ANTES DE MORIR"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "--- carga del sistema en los últimos 10 minutos del arranque anterior ---"
journalctl -b -1 --no-pager -o short-iso 2>/dev/null | tail -1
echo "--- avisos del núcleo del arranque anterior ---"
journalctl -b -1 -k --no-pager 2>/dev/null | grep -iE 'error|fail|warn|hung|blocked|I/O|reset|link is|disconnect' | tail -20 || echo "(sin avisos del núcleo)"
echo "--- ¿se quedó sin memoria? (OOM) ---"
journalctl -b -1 --no-pager 2>/dev/null | grep -iE 'out of memory|oom-kill|killed process' | tail -10 || echo "(sin OOM)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "18 · LA TAPA Y EL BOTÓN: ¿SE CIERRA EL PORTÁTIL Y SE APAGA?"
echo "════════════════════════════════════════════════════════════════════════════════"
# El núcleo registra CADA apertura y cierre de tapa y cada pulsación del botón, con hora. Si alguien cierra el
# portátil por la noche y la BIOS está puesta en «apagar al cerrar la tapa», el apagado es de hardware: no deja
# secuencia de apagado en el diario y `wtmp` lo apunta como «crash». Encaja con lo medido (muere por la tarde
# y vuelve por la mañana) y no lo puede evitar `logind`, porque sus HandleLidSwitch sólo dicen lo que hace
# LINUX, no lo que hace la BIOS.
echo "--- estado de la tapa AHORA ---"
for t in /proc/acpi/button/lid/*/state; do
  [ -f "$t" ] && echo "· $t: $(cat "$t")"
done 2>/dev/null || echo "(el sistema no expone interruptor de tapa)"
ls /sys/class/input/ 2>/dev/null | grep -i lid || true
echo "--- eventos de TAPA en el arranque anterior ---"
journalctl -b -1 --no-pager 2>/dev/null | grep -iE 'lid|Lid switch' | tail -15 || echo "(sin eventos de tapa: nadie cerró el portátil)"
echo "--- eventos de BOTÓN en el arranque anterior ---"
journalctl -b -1 --no-pager 2>/dev/null | grep -iE 'power button|power key|button.*pressed' | tail -15 || echo "(sin pulsaciones de botón)"
echo "--- y en el arranque de dos veces atrás, por si el patrón se repite ---"
journalctl -b -2 --no-pager 2>/dev/null | grep -iE 'lid|power button|power key' | tail -15 || echo "(sin eventos)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "19 · EL OTRO APAGADO, PARA COMPARAR (25/09 a las 23:04)"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "--- últimas líneas del arranque -2 ---"
journalctl -b -2 -n 15 --no-pager 2>/dev/null
echo "--- avisos del núcleo del arranque -2 ---"
journalctl -b -2 -k -p warning --no-pager 2>/dev/null | tail -15 || echo "(sin avisos)"
echo "--- errores de hardware (MCE) en cualquier arranque ---"
journalctl --no-pager 2>/dev/null | grep -iE 'machine check|mce:|Hardware Error|CPU.*throttl|thermal event' | tail -10 || echo "(sin errores de hardware)"

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo "20 · ¿ESTÁ ENCHUFADO DE VERDAD? (adaptador y consumo)"
echo "════════════════════════════════════════════════════════════════════════════════"
for d in /sys/class/power_supply/ADP*/; do
  [ -d "$d" ] || continue
  echo "· $(basename "$d")"
  for dato in online type usb_type; do
    [ -f "$d/$dato" ] && printf '    %-12s %s\n' "$dato" "$(cat "$d/$dato" 2>/dev/null)"
  done
done 2>/dev/null
echo "--- ¿la batería se está vaciando aunque esté enchufado? (2 muestras, 45 s) ---"
if [ -f /sys/class/power_supply/BAT0/energy_now ]; then
  a="$(cat /sys/class/power_supply/BAT0/energy_now)"
  echo "    ahora       $a µWh"
  sleep 45
  b="$(cat /sys/class/power_supply/BAT0/energy_now)"
  echo "    en 45 s     $b µWh"
  if [ "$b" -lt "$a" ]; then
    echo "    → ESTÁ BAJANDO: el portátil no está tirando de la corriente, está tirando de la batería."
    echo "      Con esto, cualquier corte de luz lo apaga, y sin luz no vuelve."
  elif [ "$b" -gt "$a" ]; then
    echo "    → ESTÁ SUBIENDO: el adaptador carga. La corriente llega bien."
  else
    echo "    → IGUAL: enchufado y sin gastar batería (lo normal con corriente y carga limitada)."
  fi
fi


