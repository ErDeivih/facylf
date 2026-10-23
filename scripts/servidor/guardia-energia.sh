#!/bin/sh
# facylf · guardia de energía (sustituye a guardia-bateria.sh, 18/10/2026)
#
# EL PROBLEMA. El servidor es un portátil con un cargador que no da para la carga alta: con el cargador
# enchufado la batería BAJA, y cuando llega a 0 % se apaga de golpe (caídas del 14/10, 17/10 y 18/10; el
# registro de /var/log/facylf-temperatura.log lo muestra: 0 % «Charging», 49-61 °C, sin cuelgue).
#
# POR QUÉ NO BASTABA LA GUARDIA ANTERIOR (umbrales fijos 60/30/15 %):
#   · entre 30 y 60 % no hacía nada, así que con 52 % y bajando seguía al 250 % hasta el 30 %;
#   · para volver a 250 % exigía pasar de 60 %, y el modo conservación de Lenovo para la carga en ~60 %:
#     una vez bajada, podía quedarse bajada para siempre;
#   · el techo de CPU sólo reparte tiempo: la CPU sigue a toda frecuencia (con turbo) en sus ratos, y lo
#     que gasta energía es la frecuencia. No tocaba la frecuencia.
#
# LO QUE HACE ÉSTA, cada minuto:
#   1. Turbo APAGADO siempre (intel_pstate/no_turbo=1). Es lo que más consume y lo que menos rinde aquí:
#      el ritmo lo marca la cortesía con las webs (una petición cada 6-13 s), no la CPU.
#   2. Mira la TENDENCIA de la batería en los últimos 10 min (energía, no el % redondeado):
#      si baja con el cargador puesto → sube un escalón de ahorro (como mucho uno cada 10 min);
#      si sube, o está llena / en conservación → baja un escalón (como mucho uno cada 20 min).
#   3. Suelos por % que mandan siempre: <40 % ≥E1 · <30 % ≥E2 · <20 % ≥E3 · <12 % ≥E4 · ≤6 % → E5.
#      Sin cargador: como mínimo E3.
#   4. Escalones (techo de CPU / frecuencia máxima sobre la BASE):
#                   E0 250 % y sin tope · E1 200 %/90 % · E2 150 %/75 % · E3 100 %/60 %
#                   E4 60 %/45 % y PARA los recolectores salvo CyL (se vuelven a arrancar al salir de E4)
#                   E5 apagado LIMPIO (poweroff; Docker para los contenedores), con despertador a las 2 h: mejor que morir con las
#                   colas SQLite a medias y quedarse apagado hasta que alguien lo encienda.
#   5. Tras arrancar, empieza como mínimo en E2 (todos los contenedores arrancan a la vez).
#   6. De un escalón del que hubo que huir no se vuelve en 2 h (si no, oscilaría todo el día).
#
# Variables para probarlo sin tocar nada: FACYLF_SYS (raíz de /sys), FACYLF_GUARDIA_ESTADO (carpeta de
# estado), FACYLF_GUARDIA_SECO=1 (escribe lo que haría en vez de hacerlo), FACYLF_AHORA (epoch).
# Instalar / deshacer: scripts/servidor/instala-guardia-energia.sh

SYS=${FACYLF_SYS:-/sys}
EST=${FACYLF_GUARDIA_ESTADO:-/run/facylf-guardia}
# Lo que tiene que sobrevivir a un reinicio (qué recolectores paró la guardia) va a disco, no a /run: los paró
# con `docker stop`, y un contenedor parado a mano NO vuelve solo al arrancar (restart: unless-stopped).
DUR=${FACYLF_GUARDIA_DURADERO:-/var/lib/facylf-guardia}
SECO=${FACYLF_GUARDIA_SECO:-0}
LOG=${FACYLF_GUARDIA_LOG:-/var/log/facylf-guardia.log}
AHORA=${FACYLF_AHORA:-$(date +%s)}
mkdir -p "$EST" "$DUR"

anota() { echo "$(date -d "@$AHORA" '+%F %T' 2>/dev/null || date '+%F %T') $*" >> "$LOG"; [ "$SECO" = 1 ] || logger -t facylf-guardia "$*" 2>/dev/null; }
haz() { if [ "$SECO" = 1 ]; then echo "HARÍA: $*"; else sh -c "$*" >/dev/null 2>&1; fi; }
lee() { cat "$1" 2>/dev/null; }

# ── lecturas ──────────────────────────────────────────────────────────────────────────────────────────────
PS=$SYS/class/power_supply
BAT=""; for b in "$PS"/BAT*; do [ -r "$b/capacity" ] && BAT=$b && break; done
[ -n "$BAT" ] || exit 0
cap=$(lee "$BAT/capacity"); estado=$(lee "$BAT/status")
case "$cap" in ''|*[!0-9]*) exit 0 ;; esac
ac=1; for a in "$PS"/ADP* "$PS"/AC*; do [ -r "$a/online" ] && ac=$(lee "$a/online") && break; done
ahora_e=$(lee "$BAT/energy_now"); lleno_e=$(lee "$BAT/energy_full")
[ -n "$ahora_e" ] || { ahora_e=$(lee "$BAT/charge_now"); lleno_e=$(lee "$BAT/charge_full"); }
if [ -n "$ahora_e" ] && [ -n "$lleno_e" ] && [ "$lleno_e" -gt 0 ] 2>/dev/null; then
  milesimas=$(( ahora_e * 1000 / lleno_e ))
else
  milesimas=$(( cap * 10 ))
fi

# historial de los últimos ~40 min: «epoch milésimas»
H=$EST/historial
echo "$AHORA $milesimas" >> "$H"
tail -n 40 "$H" > "$H.n" && mv "$H.n" "$H"
hace10=$(awk -v l=$((AHORA - 600)) '$1 <= l { v = $2 } END { if (v != "") print v }' "$H")
tendencia=""
[ -n "$hace10" ] && tendencia=$(( milesimas - hace10 ))   # en milésimas de la batería llena, por 10 min

# ── decisión ──────────────────────────────────────────────────────────────────────────────────────────────
nivel=$(lee "$EST/nivel"); ultimo=$(lee "$EST/cambio"); [ -n "$ultimo" ] || ultimo=0
primero=0; [ -n "$nivel" ] || { nivel=2; primero=1; }
suelo=0
[ "$cap" -lt 40 ] && suelo=1
[ "$cap" -lt 30 ] && suelo=2
[ "$cap" -lt 20 ] && suelo=3
[ "$cap" -lt 12 ] && suelo=4
[ "$ac" = 1 ] || { [ "$suelo" -lt 3 ] && suelo=3; }
causa_suelo="batería al ${cap}%"
sube_suelo() { if [ "$1" -gt "$suelo" ]; then suelo=$1; causa_suelo=$2; fi; }

# ── OTRAS TRES VÍAS DE CAÍDA, que no pasan por la batería (añadidas el 18/10/2026: David no va a vigilar en
#    una semana) ──────────────────────────────────────────────────────────────────────────────────────────────
# · CALOR: la temperatura más alta de las zonas térmicas. ≥ 80 °C → E2 como mínimo; ≥ 88 °C → E3.
temp=0
for z in "$SYS"/class/thermal/thermal_zone*/temp "$SYS"/class/hwmon/hwmon*/temp1_input; do
  v=$(lee "$z"); case "$v" in ''|*[!0-9]*) continue ;; esac
  v=$(( v / 1000 )); [ "$v" -gt "$temp" ] && [ "$v" -lt 150 ] && temp=$v
done
[ "$temp" -ge 80 ] && sube_suelo 2 "temperatura ${temp} °C"
[ "$temp" -ge 88 ] && sube_suelo 3 "temperatura ${temp} °C"
# · DISCO LLENO: con menos de 5 GB libres en los datos, E4 (para los recolectores, que son los que escriben);
#   PostgreSQL y SQLite se corrompen o se paran si el disco se llena del todo.
DATOS=${FACYLF_DATOS:-/srv/data}
libre_gb=""
if [ -d "$DATOS" ]; then libre_gb=$(df -Pk "$DATOS" 2>/dev/null | awk 'NR==2 { print int($4 / 1048576) }'); fi
[ -n "$libre_gb" ] && [ "$libre_gb" -lt 5 ] && sube_suelo 4 "sólo ${libre_gb} GB libres en ${DATOS}"
# · SOBRECARGA: carga media de 5 min. Por encima de 18 (en 4 hilos) se sube un escalón como si la batería bajara
#   (la espiral del 15/10 llegó a 35); y no se baja de escalón mientras pase de 12.
carga5=$(awk '{ printf "%d", $2 }' "${FACYLF_PROC:-/proc}/loadavg" 2>/dev/null); [ -n "$carga5" ] || carga5=0
desde=$(( AHORA - ultimo ))
nuevo=$nivel
motivo=""
# Para subir de escalón se esperan 10 min desde el último cambio: así la ventana de 10 min mide ya el escalón
# nuevo y no el anterior (si no, se sube uno de más). Los suelos por % no esperan.
if [ -n "$tendencia" ] && [ "$tendencia" -le -5 ] && [ "$desde" -ge 600 ]; then
  nuevo=$(( nivel + 1 )); motivo="la batería baja ${tendencia}‰ en 10 min"
elif [ "$carga5" -gt 18 ] && [ "$desde" -ge 600 ]; then
  nuevo=$(( nivel + 1 )); motivo="sobrecarga: carga media ${carga5} en 5 min"
elif [ "$desde" -ge 1200 ] && [ "$carga5" -le 12 ] && { [ -n "$tendencia" ] && [ "$tendencia" -ge 5 ] || \
       { [ "$cap" -ge 50 ] && [ "$ac" = 1 ] && { [ "$estado" = "Full" ] || [ "$estado" = "Not charging" ]; } && [ -n "$tendencia" ] && [ "$tendencia" -ge 0 ]; }; }; then
  nuevo=$(( nivel - 1 )); motivo="la batería se sostiene (${tendencia}‰ en 10 min, ${estado})"
fi
# Memoria de 2 h: si de un escalón hubo que huir porque la batería bajaba, no se vuelve a él en 2 h. Sin esto,
# E0 → (baja) → E1 → (se sostiene 20 min) → E0 → (baja) … oscilaría todo el día.
malo=$(lee "$EST/malo")
if [ "$nuevo" -gt "$nivel" ]; then
  echo "$nivel $AHORA" > "$EST/malo"
elif [ "$nuevo" -lt "$nivel" ] && [ -n "$malo" ]; then
  malo_n=${malo% *}; malo_t=${malo#* }
  if [ $(( AHORA - malo_t )) -lt 7200 ] && [ "$nuevo" -le "$malo_n" ]; then nuevo=$nivel; motivo=""; fi
fi
[ "$nuevo" -lt "$suelo" ] && { nuevo=$suelo; motivo="suelo por ${causa_suelo}${motivo:+; $motivo}"; }
[ "$nuevo" -lt 0 ] && nuevo=0
[ "$nuevo" -gt 4 ] && nuevo=4
if [ "$cap" -le 6 ]; then
  # 23/10/2026: a las 12:05 se apagó al 6 % y el reloj de la placa la despertó a las 14:06 con el 6 % todavía;
  # la guardia volvió a apagarla UN MINUTO después, así que se perdió hora y media y hubo que encenderla a mano.
  # Si acaba de arrancar y el cargador está puesto, no se apaga: se para todo menos CyL y se la deja cargar.
  uptime_min=$(( $(cut -d. -f1 /proc/uptime) / 60 ))
  if [ "$ac" = 1 ] && [ "$uptime_min" -lt 15 ]; then
    nuevo=4; motivo="batería al ${cap}% y acaba de arrancar: se para todo menos CyL para que cargue"
  elif [ "$ac" != 1 ] || [ -z "$tendencia" ] || [ "$tendencia" -le 0 ]; then
    nuevo=5; motivo="batería al ${cap}%: apagado limpio"
  fi
fi

# ── turbo apagado siempre (barato de repetir) ─────────────────────────────────────────────────────────────
P=$SYS/devices/system/cpu/intel_pstate
if [ -w "$P/no_turbo" ] || [ "$SECO" = 1 ]; then
  [ "$(lee "$P/no_turbo")" = 1 ] || haz "echo 1 > $P/no_turbo"
elif [ -w "$SYS/devices/system/cpu/cpufreq/boost" ]; then
  [ "$(lee "$SYS/devices/system/cpu/cpufreq/boost")" = 0 ] || haz "echo 0 > $SYS/devices/system/cpu/cpufreq/boost"
fi

# ── modo conservación de Lenovo APAGADO siempre ──────────────────────────────────────────────────────────
# Con el modo conservación puesto, la batería se queda en ~60 % y NO carga (estado «Not charging»), así que
# cualquier bajada de tensión se la come. David decidió cargar al 100 %; se repite aquí porque tras un apagón
# el EC lo vuelve a poner él solo (pasó el 23/10: el fichero de tmpfiles lo deja a 0 al arrancar y aun así
# estaba a 1 después del apagón de las 12:05).
CM=$SYS/bus/platform/drivers/ideapad_acpi/VPC2004:00/conservation_mode
if [ -w "$CM" ] || [ "$SECO" = 1 ]; then
  [ "$(lee "$CM")" = 0 ] || haz "echo 0 > $CM"
fi

# Un pulso por hora en el registro aunque no cambie nada: así, al volver, se ve que la guardia ha estado viva.
# (Por la hora del último pulso, no por «minuto 0»: el temporizador deriva unos segundos y se saltaba horas.)
ultimo_pulso=$(lee "$EST/pulso"); [ -n "$ultimo_pulso" ] || ultimo_pulso=0
if [ "$nuevo" = "$nivel" ] && [ $(( AHORA - ultimo_pulso )) -ge 3600 ]; then
  anota "pulso: E${nivel} · batería ${cap}% ${estado} cargador=${ac} · ${temp} °C · carga ${carga5} · ${libre_gb:-?} GB libres"
  echo "$AHORA" > "$EST/pulso"
fi
# Tras un reinicio, si quedaron recolectores parados por la guardia y ya no toca E4, se aplican los cambios.
[ "$nuevo" = "$nivel" ] && [ "$primero" = 0 ] && exit 0

# ── aplicar ───────────────────────────────────────────────────────────────────────────────────────────────
case "$nuevo" in
  # E0 ya no deja 250 %: el 23/10, con 250 % y la carga en 13, el cargador dejó de sostener la batería y se
  # fue del 100 % al 6 % en hora y media (con 200 % y carga 9-10 el 22 % aguantó seis horas sin bajar). El
  # cargador de este portátil es el que es; mejor que la máquina vaya un 20 % más lenta que morirse 3 h.
  0) cuota=200%; frec=100 ;;
  1) cuota=200%; frec=90 ;;
  2) cuota=150%; frec=75 ;;
  3) cuota=100%; frec=60 ;;
  *) cuota=60%;  frec=45 ;;
esac
anota "E${nivel} -> E${nuevo}: ${motivo:-arranque} · batería ${cap}% ${estado} cargador=${ac} · ${temp} °C · carga ${carga5} · ${libre_gb:-?} GB libres · CPUQuota ${cuota}, frecuencia ${frec}%"
haz "systemctl set-property --runtime facylf.slice CPUQuota=$cuota"
# Frecuencia máxima. El servidor usa intel_pstate en modo PASIVO (driver intel_cpufreq, petición 157): lo que
# manda es `scaling_max_freq` de cada núcleo. `max_perf_pct` no se toca (se queda en 100).
for c in "$SYS"/devices/system/cpu/cpu[0-9]*/cpufreq; do
  tope=$(lee "$c/cpuinfo_max_freq"); minimo=$(lee "$c/cpuinfo_min_freq")
  [ -n "$tope" ] || continue
  # El % es sobre la frecuencia BASE (2,2 GHz en el i5-5200U), no sobre la de turbo (2,7): con el turbo apagado,
  # un 85 % de 2,7 no limitaría nada. E0 deja el tope libre.
  base=$(lee "$c/base_frequency"); [ -n "$base" ] || base=$(( tope * 81 / 100 ))
  if [ "$frec" -ge 100 ]; then f=$tope; else f=$(( base * frec / 100 )); fi
  [ -n "$minimo" ] && [ "$f" -lt "$minimo" ] && f=$minimo
  haz "echo $f > $c/scaling_max_freq"
done

PARADOS=$DUR/parados
if [ "$nuevo" -ge 4 ] && [ ! -s "$PARADOS" ]; then
  # Todos los recolectores menos CyL. No se tocan base de datos, web, monitor ni importador.
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^facylf-.*-1$' | grep -v -E '^facylf-federacion-1$' > "$PARADOS.n"
  mv "$PARADOS.n" "$PARADOS"
  anota "E4: se paran $(wc -l < "$PARADOS") recolectores (CyL sigue): $(tr '\n' ' ' < "$PARADOS")"
  [ -s "$PARADOS" ] && haz "docker stop -t 60 $(tr '\n' ' ' < "$PARADOS")"
elif [ "$nuevo" -le 3 ] && [ -s "$PARADOS" ]; then
  anota "sale de E4: se vuelven a arrancar $(tr '\n' ' ' < "$PARADOS")"
  haz "docker start $(tr '\n' ' ' < "$PARADOS")"
  : > "$PARADOS"
fi

if [ "$nuevo" = 5 ]; then
  anota "E5: apagado limpio para no morir con las colas a medias"
  # Despertador del reloj de la placa a las 2 h: apagado, el cargador SÍ da para cargar la batería, así que
  # vuelve a encenderse solo y con carga. Sin esto se quedaba apagado hasta que David lo encendiera (35 h el
  # 17/10). Si la BIOS no lo admite, no pasa nada: sólo no se despierta.
  # rtcwake no está instalado en el servidor (petición 157): se usa el reloj directamente.
  if command -v rtcwake >/dev/null 2>&1; then haz "rtcwake -m no -s 7200"
  elif [ -e "$SYS/class/rtc/rtc0/wakealarm" ]; then haz "echo 0 > $SYS/class/rtc/rtc0/wakealarm; echo +7200 > $SYS/class/rtc/rtc0/wakealarm"; fi
  # Sin `docker stop`: al apagar, systemd para el demonio de Docker y éste para los contenedores con su señal; así
  # conservan `restart: unless-stopped` y arrancan solos al volver. Un `docker stop` los dejaría parados.
  haz "systemctl poweroff"
fi

echo "$nuevo" > "$EST/nivel"; echo "$AHORA" > "$EST/cambio"
