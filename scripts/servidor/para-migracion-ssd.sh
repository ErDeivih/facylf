#!/usr/bin/env bash
# Para la migración al SSD y deja el estado EN CLARO: qué federaciones tienen ya el enlace, cuál resuelve y
# cuál no. Se escribe como guion porque pasar esto por `ssh` desde PowerShell rompe las comillas (regla del
# traspaso, incumplida tres veces hoy).
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '── parando la migración ──'
for patron in 'mueve-colas-al-ssd-todas' 'mueve-cola-al-ssd.sh'; do
  if pkill -f "$patron" 2>/dev/null; then echo "  parado: $patron"; else echo "  no corría: $patron"; fi
done
sleep 3
pgrep -af 'mueve-cola' | sed 's/^/  sigue: /' || echo '  nada corriendo'

echo
echo '── estado de cada cola ──'
printf '  %-22s %-10s %-10s %s\n' federación esEnlace resuelve destino
for f in "$RAIZ"/descargas-*/recolector-local/cola-v2.sqlite; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  fed=$(printf '%s' "$f" | sed 's|.*/descargas-||; s|/recolector-local.*||')
  case "$fed" in prueba*|*-sondeo) continue ;; esac

  if [ -L "$f" ]; then
    esEnlace='sí'
    destino=$(readlink "$f")
    # Resuelve si el fichero al que apunta se puede leer.
    if [ -r "$destino" ]; then resuelve='sí'; else resuelve='NO'; fi
  else
    esEnlace='no'; destino='—'; resuelve='—'
  fi
  printf '  %-22s %-10s %-10s %s\n' "$fed" "$esEnlace" "$resuelve" "$destino"
done

echo
echo '── y qué copias hay guardadas por si hay que volver atrás ──'
ls -1 "$RAIZ"/descargas-*/recolector-local/cola-v2.sqlite.envuelta-en-ssd 2>/dev/null | sed 's/^/  /' \
  || echo '  (ninguna)'
