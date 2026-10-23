#!/bin/bash
# ── RETOMAR EL HISTÓRICO EN EL SERVIDOR: BAJAR EL SUELO DE TEMPORADAS ────────────────────────────────────
#
# Añade `FACYLF_TEMPORADA_MINIMA` al ancla `&ambiente-recolector` de `compose.yml`, que es de donde las 16
# federaciones sacan su entorno. En el PC ya está hecho (`entorno-flota.ps1`) y verificado: los recolectores
# pasaron a servir 92-99 claves de trabajo de temporadas antiguas.
#
# ── POR QUÉ ES SEGURO AQUÍ, Y POR QUÉ LO COMPRUEBO ANTES ─────────────────────────────────────────────────
#
# El fichero avisa de que un servicio que declare su propio `environment:` REEMPLAZA el del ancla entera, y que
# eso ya costó una federación (Murcia se quedó sin `FACYLF_MEMORIA_GB` y el worker esperaba memoria para
# siempre, con el contenedor «arriba» y sin recoger nada).
#
# Pero `compara-entorno-recolectores.sh` —que existe para cazar justo eso— demuestra que HOY no pasa: las 16
# tienen sus cinco variables, incluidas las que añaden `FACYLF_PERF` y `FACYLF_EXCLUIR`. Es decir, usan la clave
# de fusión `<<: *ambiente-recolector` y el ancla les llega. Por eso el cambio es una línea y no veinte.
#
# Este guion: copia de seguridad, inserta la línea, valida con `docker compose config` y NO recrea nada. La
# comprobación de que llegó de verdad es el mismo `compara-entorno-recolectores.sh` después de recrear.
#
# Uso:  bash retoma-historico-servidor.sh [--aplicar]
set -u
APLICAR=0
[ "${1:-}" = "--aplicar" ] && APLICAR=1
D=/srv/data/facylf/docker
C="$D/compose.yml"
LINEA='  FACYLF_TEMPORADA_MINIMA: "${FACYLF_TEMPORADA_MINIMA:-2023-24}"'

echo "=== antes ==="
grep -n 'FACYLF_MEMORIA_GB\|FACYLF_TEMPORADA_MINIMA' "$C" | head -4 | sed 's/^/  /'

if grep -q 'FACYLF_TEMPORADA_MINIMA' "$C"; then
  echo "  ya estaba puesta: no se toca."
  exit 0
fi

if [ "$APLICAR" != "1" ]; then
  echo
  echo "  (MIRAR: se insertaría esta línea justo después de FACYLF_CHROME_HEADLESS, dentro del ancla:)"
  echo "    ${LINEA}"
  echo "  Repetir con --aplicar."
  exit 0
fi

cp -a "$C" "${C}.previo-$(date +%Y%m%d-%H%M%S)"
# Se inserta DENTRO del ancla: después de la línea de FACYLF_CHROME_HEADLESS, que es la última del bloque fijo
# antes de los comentarios largos. Con `sed` por número de línea del ancla, no por patrón suelto, para no
# acertar en una línea de comentario que mencione la misma variable.
n=$(grep -n '^  FACYLF_CHROME_HEADLESS:' "$C" | head -1 | cut -d: -f1)
if [ -z "$n" ]; then echo "  *** no encuentro el ancla: NO se toca nada ***"; exit 2; fi
sed -i "${n}a\\${LINEA}" "$C"
echo "=== después ==="
grep -n 'FACYLF_MEMORIA_GB\|FACYLF_CHROME_HEADLESS\|FACYLF_TEMPORADA_MINIMA' "$C" | head -4 | sed 's/^/  /'

echo
echo "=== validación de sintaxis (docker compose config) ==="
cd "$D" && docker compose -f compose.yml -f compose-turnos.yml config >/dev/null 2>/tmp/err-compose.txt \
  && echo "  ✓ el compose es válido" \
  || { echo "  *** COMPOSE INVÁLIDO: se restaura la copia ***"; head -5 /tmp/err-compose.txt | sed 's/^/    /'; cp -a "$(ls -t ${C}.previo-* | head -1)" "$C"; echo "  restaurado."; exit 2; }

echo
echo "  FALTA: recrear los contenedores y comprobarlo."
echo "    docker compose -f compose.yml -f compose-turnos.yml up -d"
echo "    bash scripts/servidor/compara-entorno-recolectores.sh   # debe salir la columna nueva en las 16"
