#!/usr/bin/env bash
# Para la migración al SSD, levanta cualquier recolector que se haya quedado parado y deja el estado en claro.
#
# ── POR QUÉ HIZO FALTA ───────────────────────────────────────────────────────────────────────────────────
#
# La migración para el contenedor para copiar la cola quieta. Si algo de después se atasca, el contenedor se
# queda PARADO y esa federación no recolecta — sin que nada avise. Me pasó el 23/09/2026: `PRAGMA quick_check`
# sobre una copia de 500 MB tardaba **24 minutos** (recorre la base entera y todos sus índices), así que con
# colas de 500-1000 MB la verificación era el cuello, no la copia. Y lanzé dos lotes a la vez, con lo que la
# cosa se enredó.
#
# Este guion deja de migrar y vuelve a levantar lo que esté caído. NO deshace enlaces: sólo asegura que todo
# esté en marcha.
#
# SÓLO ACTÚA SOBRE CONTENEDORES PARADOS DE LA FLOTA. Nunca toca uno que esté en marcha.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '── 1. parando la migración ──'
for patron in 'mueve-colas-al-ssd-todas' 'mueve-cola-al-ssd.sh'; do
  if pkill -f "$patron" 2>/dev/null; then echo "  parado: $patron"; else echo "  no corría: $patron"; fi
done
# Y los contenedores efímeros de verificación, que son los que se quedan colgados.
for id in $(docker ps -q --filter ancestor=facylf-recolectores:local); do
  args=$(docker inspect "$id" --format '{{join .Args " "}}' 2>/dev/null)
  case "$args" in
    *entrada-recolector*) continue ;;
    *quick_check*|*DatabaseSync*) echo "  parando verificación colgada: $id"; docker rm -f "$id" >/dev/null 2>&1 ;;
  esac
done
sleep 2

echo
echo '── 2. levantando los recolectores que estén parados ──'
for c in $(docker ps -a --filter name=facylf- --format '{{.Names}}' | grep -v -E 'importador|monitor|web|postgres' | sort); do
  estado=$(docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)
  if [ "$estado" != "running" ]; then
    echo "  $c estaba en «$estado»: se arranca"
    docker start "$c" >/dev/null 2>&1 && echo "    ✓ arrancado" || echo "    ✗ no se pudo arrancar"
  fi
done

echo
echo '── 3. estado de cada cola: enlace o fichero ──'
printf '  %-22s %-9s %s\n' federación tipo destino
for f in "$RAIZ"/descargas-*/recolector-local/cola-v2.sqlite; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  fed=$(printf '%s' "$f" | sed 's|.*/descargas-||; s|/recolector-local.*||')
  case "$fed" in prueba*|*-sondeo) continue ;; esac
  if [ -L "$f" ]; then
    printf '  %-22s %-9s %s\n' "$fed" 'SSD' "$(readlink "$f")"
  else
    printf '  %-22s %-9s %s\n' "$fed" 'duro' '—'
  fi
done
