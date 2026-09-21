#!/usr/bin/env bash
# Supervisor de UNA federación dentro de su contenedor.
#
# Es el equivalente en Linux de `scripts/ejecutar-recolector-programado.ps1`: arranca el worker, espera a que
# termine su tanda y lo vuelve a arrancar. En Windows esa espera la elige `proximo-trabajo.mjs` (0 s si hay
# trabajo disponible, o los segundos que faltan para el siguiente aplazado); aquí se hace lo mismo, así que el
# contenedor no abre un navegador cada minuto para no hacer nada.
#
# Lo que cambia respecto a Windows:
#   · no hay mutex ni ficheros de plaza por carril: el gobernador de plazas es el MISMO (vive en el volumen
#     compartido `.estado-workers`, que ven todos los contenedores), así que el presupuesto se respeta entre
#     todos aunque cada federación esté en su contenedor;
#   · la limpieza de navegadores huérfanos se hace con `pkill` sobre el perfil de ESTA federación: en Linux no
#     hay PowerShell, y el worker ya se salta esa limpieza cuando el sistema no es Windows.
#
# Uso: entrada-recolector.sh <federacion>
set -u

fed="${1:?falta la federación: entrada-recolector.sh <federacion>}"
raiz="/app"
carpeta="$raiz/descargas-$fed/recolector-local"
registro="$carpeta/worker-programado.log"
perfil="$raiz/perfiles/$fed.json"
espera_min="${FACYLF_ESPERA_MIN:-20}"
espera_max="${FACYLF_ESPERA_MAX:-3600}"

mkdir -p "$carpeta"

# Al arrancar el contenedor se recogen los restos de la sesión anterior: si el contenedor murió de golpe, su
# Chrome puede haber quedado vivo (y ocupando memoria que necesita el siguiente navegador).
#
# Y se retiran los ficheros de «sesión única» del perfil. Medido el 18/09/2026: al compartir la carpeta de la
# cola entre el PC y el contenedor, un `SingletonLock` que dejó el Chrome del PC impide arrancar el Chromium del
# contenedor —`SessionNotCreatedError: session created: Chrome instance exited`— y el worker moría en bucle cada
# 20 s. En el servidor no hay dos sistemas sobre el mismo perfil, pero el fichero también se queda huérfano si el
# contenedor se para de golpe, así que se limpia siempre antes de abrir el navegador.
limpia_restos() {
  pkill -f "user-data-dir=$carpeta/perfil-chrome" 2>/dev/null || true
  rm -f "$carpeta/perfil-chrome/SingletonLock" \
        "$carpeta/perfil-chrome/SingletonSocket" \
        "$carpeta/perfil-chrome/SingletonCookie" 2>/dev/null || true
}

# Y al pararlo, se suelta la plaza de navegador que tuviera el worker.
#
# Importa: una plaza que se queda «ocupada» por un proceso que ya no existe la limpia el siguiente worker que
# mire (detecta el identificador muerto), pero mientras nadie mire, el reparto cree que hay un navegador menos
# del que hay. En un servidor que se reinicia o se actualiza de vez en cuando, eso son plazas fantasma
# acumulándose.
limpia_plaza_del_pid() {
  local pid="$1"
  [ -z "$pid" ] && return
  for f in "$raiz"/.estado-workers/slots-chrome/*.lock; do
    [ -f "$f" ] || continue
    # La ficha guarda `pid contenedor`, así que se compara SÓLO el primer campo: comparar la línea entera contra
    # el identificador no casaba nunca y dejaba la plaza puesta al parar (lo cazó la prueba de aceptación).
    local contenido
    contenido="$(cat "$f" 2>/dev/null)"
    [ "${contenido%% *}" = "$pid" ] && rm -f "$f"
  done
}

worker=""
al_salir() {
  echo "$(date '+%F %T')  Contenedor parado; se cierra el navegador y se suelta la plaza." >> "$registro"
  if [ -n "$worker" ]; then
    kill -TERM "$worker" 2>/dev/null || true
    sleep 2
    kill -KILL "$worker" 2>/dev/null || true
    limpia_plaza_del_pid "$worker"
  fi
  limpia_restos
  exit 0
}
trap al_salir TERM INT

# El comando del recolector: las federaciones iSquad (Madrid y Valencia) tienen su propio guion.
guion="recolector-local.mjs"
case "$fed" in
  madrid|valencia) guion="recolector-$fed.mjs" ;;
  cataluna) guion="recolector-cataluna-datos.mjs" ;;
esac
if [ ! -f "$raiz/scripts/$guion" ]; then
  echo "$(date '+%F %T')  No existe $raiz/scripts/$guion" >> "$registro"
  exit 1
fi

echo "$(date '+%F %T')  Supervisor en contenedor iniciado para $fed (script $guion)." >> "$registro"

# ── QUIÉN VA SIN `--perfil` ─────────────────────────────────────────────────────────────────────────────
#
# Castilla y León es la ÚNICA federación sin perfil propio: es el comportamiento original del recolector
# (RFCYLF) y su cola vive en `descargas-federacion`. El plan del PC (`scripts/lib/plan-flota.mjs`,
# `FEDERACION_SIN_PERFIL`) la lanza con `arrancar` a secas, y el recolector decide por la AUSENCIA de `--perfil`
# cuál es su portal y su carpeta.
#
# Sin esta rama el contenedor pedía `perfiles/federacion.json`, que no existe (ni debe existir), y la
# federación moría en bucle cada 20 s con `ENOENT: no such file or directory, open '/app/perfiles/federacion.json'`
# —medido en el servidor el 21/09/2026, con el contenedor reiniciándose sin recolectar nada.
sin_perfil=0
case "$fed" in
  federacion|madrid|valencia|cataluna) sin_perfil=1 ;;
esac

while true; do
  limpia_restos
  echo "$(date '+%F %T')  Arrancando o reanudando la ingesta." >> "$registro"
  # El worker va en segundo plano para poder pararlo con orden si el contenedor recibe la señal de cierre.
  if [ "$sin_perfil" = "1" ]; then
    node "$raiz/scripts/$guion" arrancar >> "$registro" 2>&1 &
  else
    node "$raiz/scripts/$guion" arrancar --perfil "$perfil" >> "$registro" 2>&1 &
  fi
  worker=$!
  wait "$worker"
  codigo=$?
  worker=""

  # Cuánto esperar antes de la siguiente tanda: lo decide el mismo ayudante que en Windows.
  espera=300
  salida="$(node "$raiz/scripts/proximo-trabajo.mjs" "$carpeta/cola-v2.sqlite" 2>/dev/null | head -n 1)"
  case "$salida" in
    ''|*[!0-9]*) espera=300 ;;
    *) espera="$salida" ;;
  esac
  [ "$espera" -lt "$espera_min" ] && espera="$espera_min"
  [ "$espera" -gt "$espera_max" ] && espera="$espera_max"

  echo "$(date '+%F %T')  El worker termino con codigo $codigo; siguiente intento en $espera s." >> "$registro"
  sleep "$espera"
done
