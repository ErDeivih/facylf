#!/usr/bin/env bash
# Para SÓLO la compilación de la imagen, que es lo más pesado que hay en marcha cuando la máquina ya va cargada.
#
# ── POR QUÉ ES UN GUION Y NO UNA ORDEN SUELTA ─────────────────────────────────────────────────────────────
#
# El patrón va DENTRO del fichero a propósito. Con `pkill -f 'docker build ...'` escrito en la línea de órdenes,
# el patrón aparece en la propia línea de `ssh`, así que `pkill` se mata a sí mismo y corta la sesión — es una de
# las reglas del traspaso.
#
# SÓLO para el build. No toca ningún recolector ni ningún contenedor de la flota.
set -uo pipefail

echo '── procesos de compilación antes ──'
pgrep -af 'docker build' | sed 's/^/  /' || echo '  ninguno'

# 1. El cliente de docker que compila.
pkill -f 'docker build -f docker/Dockerfile' 2>/dev/null && echo '  cliente de build parado' || echo '  no había cliente'
# 2. El proceso de construcción dentro del daemon (BuildKit), que sigue aunque se mate al cliente.
for patron in 'buildkitd' 'dockerd --build'; do
  pgrep -f "$patron" >/dev/null 2>&1 || continue
done
# 3. Y los contenedores de compilación (los que corren `RUN ...` del Dockerfile).
for id in $(docker ps -q 2>/dev/null); do
  imagen=$(docker inspect "$id" --format '{{.Config.Image}}' 2>/dev/null)
  case "$imagen" in
    *buildkit*|*moby/buildkit*) echo "  parando contenedor de build $id"; docker rm -f "$id" >/dev/null 2>&1 ;;
  esac
done

sleep 2
echo '── procesos de compilación después ──'
pgrep -af 'docker build' | sed 's/^/  /' || echo '  ninguno'
echo
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
