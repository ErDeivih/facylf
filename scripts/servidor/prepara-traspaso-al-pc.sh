#!/usr/bin/env bash
# prepara-traspaso-al-pc.sh — el servidor deja de recoger Valencia, Madrid y Cataluña (24/09/2026)
#
# ── LA DECISIÓN Y POR QUÉ EN ESTE ORDEN ─────────────────────────────────────────────────────────────────
#
# El responsable decide que Valencia, Madrid y Cataluña recojan en el PC de trabajo y el resto siga en el
# servidor. El orden NO es indiferente:
#
#   1. Se PARAN los tres contenedores del servidor. Copiar una SQLite viva la corrompe (regla del traspaso), y
#      con los recolectores parados la cola deja de cambiar: la copia que se lleve al PC es coherente.
#   2. Se copian los árboles al PC (eso lo hace el guion del PC, no éste).
#   3. SÓLO ENTONCES se enciende la recolección en el PC. Si se encendiera antes, el PC trabajaría sobre su copia
#      vieja y al llegar la del servidor se pisaría: trabajo perdido o, peor, actas dadas por hechas sin estarlo.
#
# Y se paran de verdad, no se borran: los datos viven en el sistema de ficheros del servidor y volver a
# arrancarlas es un `up -d` cuando haga falta.
#
# ── POR QUÉ TAMBIÉN SE LE PONE UN PERFIL DE COMPOSE ──────────────────────────────────────────────────────
#
# `docker compose up -d` (sin nombres) arrancaría los tres otra vez y volverían a pedirle a los mismos portales
# que el PC: peticiones duplicadas y riesgo de que el portal nos corte. Con `profiles:` un `up -d` general NO los
# levanta, y siguen pudiéndose arrancar a propósito nombrándolos (`up -d valencia`) o con su perfil. Así el
# estado correcto es el que sale por defecto, en vez de depender de que nadie se equivoque.
#
# Uso:  bash scripts/servidor/prepara-traspaso-al-pc.sh            (para los tres)
#       bash scripts/servidor/prepara-traspaso-al-pc.sh --solo-tamano   (no para nada, sólo informa)
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

FEDERACIONES=(valencia madrid cataluna)
COMPOSE=(docker compose --project-name facylf --env-file docker/.env
         -f docker/compose.yml -f docker/compose-turnos.yml)

if [ "${1:-}" != "--solo-tamano" ]; then
  echo "══ 1. Parando ${FEDERACIONES[*]} en el servidor ══"
  # Se intenta por compose y, si el perfil inactivo se lo impide, se para por nombre: la parada tiene que ser
  # ORDENADA (SIGTERM), no un `kill`, porque el supervisor de dentro del contenedor usa esa señal para cerrar el
  # navegador y soltar su plaza de Chrome. Con un kill se quedarían plazas fantasma ocupadas.
  if ! "${COMPOSE[@]}" stop "${FEDERACIONES[@]}" 2>&1 | tail -6; then
    echo '  (compose no las para: se paran por nombre de contenedor)'
    for fed in "${FEDERACIONES[@]}"; do docker stop "facylf-${fed}-1" 2>&1 | sed 's/^/    /'; done
  fi
  echo
  echo "── estado de sus contenedores (parado = correcto) ──"
  for fed in "${FEDERACIONES[@]}"; do
    estado=$(docker inspect "facylf-${fed}-1" --format '{{.State.Status}}' 2>&1)
    if [ "$estado" != "exited" ]; then
      echo "  ${fed}: ${estado} — se insiste por nombre"
      docker stop "facylf-${fed}-1" >/dev/null 2>&1 || true
      estado=$(docker inspect "facylf-${fed}-1" --format '{{.State.Status}}' 2>&1)
    fi
    printf '  %-10s %s\n' "$fed" "$estado"
  done
fi

echo
echo "══ 2. Lo que hay que copiar al PC ══"
total=0
for fed in "${FEDERACIONES[@]}"; do
  # `du -s --block-size=1M` da megabytes enteros sin depender del idioma de la salida.
  mb=$(du -sm "/srv/data/facylf/descargas-${fed}" 2>/dev/null | cut -f1)
  printf '  %-10s %8s MB   cola %s MB\n' "$fed" "${mb:-?}" \
    "$(du -m "/srv/data/facylf/descargas-${fed}/recolector-local/cola-v2.sqlite" 2>/dev/null | cut -f1)"
  total=$((total + ${mb:-0}))
done
echo "  ────────────────────────────────────"
printf '  %-10s %8s MB en total\n' TOTAL "$total"

echo
echo "══ 3. Espacio libre para el empaquetado ══"
df -h /srv/data / | sed 's/^/  /'

echo
echo "══ 4. Comprobación de que el resto de la flota sigue en pie ══"
n=0
for c in $(docker ps --filter name=facylf- --format '{{.Names}}' 2>/dev/null \
  | grep -v -E 'importador|monitor|web|postgres|fin-de-semana'); do
  n=$((n + 1))
done
echo "  recolectores en marcha: ${n} (deben ser 16 tras parar los tres)"
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
