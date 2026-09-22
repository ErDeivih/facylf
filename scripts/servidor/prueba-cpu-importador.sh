#!/usr/bin/env bash
# ── EXPERIMENTO: ¿LA CPU ES UN RECURSO COMPARTIDO DE VERDAD? ─────────────────────────────────────────────
#
# Si la máquina está al 100 % de procesador, quitarle trabajo a un proceso tiene que NOTARSE en los demás: el
# ritmo subiría. Si no se nota, es que había procesador de sobra y el techo lo pone otra cosa (el portal, la
# cortesía, la red).
#
# Se prueba con el IMPORTADOR, que es el segundo consumidor de la máquina y no recolecta nada: se le baja la
# cuota de CPU (sin pararlo, sin reiniciarlo y sin perder nada, porque es idempotente) y se mira si la flota
# sube. Al terminar se restaura la cuota original.
#
# Uso: bash scripts/servidor/prueba-cpu-importador.sh [minutos_por_fase] [cuota_de_prueba]
set -uo pipefail

FASE=${1:-18}
CUOTA=${2:-0.15}
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
CONTENEDOR=facylf-importador

# La cuota original se lee del propio contenedor, no del compose: así se restaura EXACTAMENTE lo que había.
ORIGINAL=$(docker inspect -f '{{.HostConfig.NanoCpus}}' "$CONTENEDOR" 2>/dev/null)
if [ -z "$ORIGINAL" ] || [ "$ORIGINAL" = "0" ]; then
  echo "no se pudo leer la cuota original de $CONTENEDOR; se aborta para no dejarlo mal"
  exit 1
fi
# OJO con la configuración regional: `printf "%.2f"` en un servidor en español escribe «1,50» con COMA, y
# `docker update --cpus=1,50` falla con «failed to parse 1,50 as a rational number». Pasó el 23/09/2026: la
# cuota del importador se quedó en 0,15 y no se restauró. Por eso el número se formatea con LC_ALL=C.
ORIGINAL_CORES=$(LC_ALL=C awk -v n="$ORIGINAL" 'BEGIN { printf "%.2f", n / 1000000000 }')

echo "══ experimento de CPU compartida ══"
echo "  importador: cuota original $ORIGINAL_CORES núcleos → se pone $CUOTA durante $FASE min"
echo "  (no se para ni se reinicia: sólo se le baja el techo de procesador)"
echo

restaura() {
  echo
  echo "── restaurando la cuota original de $CONTENEDOR ($ORIGINAL_CORES núcleos) ──"
  docker update --cpus="$ORIGINAL_CORES" "$CONTENEDOR" >/dev/null
  echo "  hecho."
}
trap restaura EXIT

echo "── FASE 1: ritmo de partida ($FASE min con la cuota original) ──"
bash "$RAIZ/scripts/servidor/mide-ritmo-total.sh" "$FASE"

echo
echo "── se baja la cuota del importador a $CUOTA núcleos ──"
docker update --cpus="$CUOTA" "$CONTENEDOR" >/dev/null
echo "  hecho a las $(date +%H:%M:%S); se mide en $FASE min…"
sleep "$((FASE * 60))"

echo
echo "── FASE 2: ritmo con el importador limitado ──"
bash "$RAIZ/scripts/servidor/mide-ritmo-total.sh" "$FASE"

echo
echo "  Si la FASE 2 sale claramente por encima, el procesador es el recurso compartido que manda y"
echo "  limitar al importador es una palanca real. Si sale igual, el techo lo pone otra cosa."
