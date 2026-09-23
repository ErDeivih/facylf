#!/usr/bin/env bash
# Para SÓLO los contenedores de un programa de medición concreto, por el nombre del guion en sus argumentos.
#
# ── POR QUÉ NO SE USA `docker kill --filter ancestor=...` ────────────────────────────────────────────────
#
# Todos los recolectores y cualquier contenedor efímero comparten la MISMA imagen
# (`facylf-recolectores:local`), así que filtrar por ascendencia mata también a las 19 federaciones. Está en
# las reglas del servidor porque ya pasó una vez y se perdió media hora.
#
# Aquí se mira el ARGUMENTO de cada contenedor: sólo se para el que ejecuta el guion que se pide. SÓLO toca
# contenedores efímeros de medición; nunca uno de los 19 recolectores.
#
# Uso: bash scripts/servidor/para-medicion.sh <nombre-del-guion.mjs|--lista>
set -uo pipefail

OBJETIVO=${1:?falta el guion a parar, por ejemplo: mide-cola-en-disco.mjs (o --lista para ver qué hay)}

if [ "$OBJETIVO" = "--lista" ]; then
  echo '── contenedores de la imagen del recolector que NO son los 19 recolectores ──'
  for id in $(docker ps -q --filter ancestor=facylf-recolectores:local); do
    args=$(docker inspect "$id" --format '{{join .Args " "}}' 2>/dev/null)
    nombre=$(docker inspect "$id" --format '{{.Name}}' 2>/dev/null)
    # Los recolectores de verdad se llaman facylf-<algo>-1 y los lanza entrada-recolector.sh.
    case "$args" in
      *entrada-recolector*) continue ;;
    esac
    echo "  $id $nombre · $args"
  done
  exit 0
fi

parados=0
for id in $(docker ps -q --filter ancestor=facylf-recolectores:local); do
  args=$(docker inspect "$id" --format '{{join .Args " "}}' 2>/dev/null)
  # Doble red de seguridad: nunca se toca un lanzador de federación, pase lo que pase.
  case "$args" in
    *entrada-recolector*) continue ;;
  esac
  case "$args" in
    *"$OBJETIVO"*)
      nombre=$(docker inspect "$id" --format '{{.Name}}' 2>/dev/null)
      echo "  parando $id $nombre ($args)"
      docker rm -f "$id" >/dev/null
      parados=$((parados + 1))
      ;;
  esac
done

echo "  contenedores parados: $parados"
