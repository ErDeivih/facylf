#!/usr/bin/env bash
# ── ¿EL IMPORTADOR AVANZA O SE HA QUEDADO GIRANDO? ─────────────────────────────────────────────────────
#
# El lanzador importa grupo a grupo. Un grupo grande puede tardar minutos; un grupo ATASCADO consume CPU sin
# escribir nada, y en un servidor de 4 núcleos eso se lleva un núcleo entero sin producir. El 22/09/2026 se
# midió así: un `tsx src/cli.ts --federacion euskadi … --grupo 22619992` llevaba 12 minutos con el 57 % de un
# núcleo.
#
# Esto mira dos veces, con una pausa en medio, y compara: el tiempo de CPU del proceso, si el fichero de estado
# del lanzador se ha tocado, y qué consultas tiene abiertas PostgreSQL.
#
# Uso: bash scripts/servidor/vigila-importador.sh [segundos]
set -uo pipefail

PAUSA=${1:-60}
RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

foto() {
  echo "── $(date '+%F %T') ──"
  docker top facylf-importador 2>/dev/null | awk 'NR == 1 || /tsx|importar-masivo|cli\.mjs/ { print "  " $0 }'
  f="$RAIZ/estado/importacion-resumen.json"
  [ -f "$f" ] && echo "  resumen escrito: $(stat -c %y "$f" | cut -c1-19) · $(tail -c 200 "$f" | tr -d '\n' | tail -c 120)"
  echo "  últimas líneas del registro:"
  tail -2 "$RAIZ/estado/importacion.log" 2>/dev/null | sed 's/^/    /'
}

foto
echo
echo "… esperando $PAUSA s …"
sleep "$PAUSA"
echo
foto

echo
echo "── consultas vivas en PostgreSQL (las que llevan más de 30 s son sospechosas) ──"
docker exec facylf-postgres psql -U facylf_admin -d facylf -At -c \
  "select pid, state, round(extract(epoch from (now() - query_start))) as seg, left(regexp_replace(query, '\s+', ' ', 'g'), 90) from pg_stat_activity where state <> 'idle' and query_start is not null order by seg desc limit 8;" 2>&1 | sed 's/^/  /'
