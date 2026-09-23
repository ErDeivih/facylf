#!/usr/bin/env bash
# Compara el reloj del host, el del contenedor y lo que hay escrito en una cola.
#
# Importa porque TODOS los análisis por hora (`historico-federacion.mjs`) y los presupuestos diarios
# (`peticionesHoy`, por día civil de Madrid) dependen de que estas tres cosas coincidan. Si el contenedor va
# con otro huso, una medición «por horas» compara horas distintas sin avisar.
#
# SÓLO LEE.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo "host        : $(date '+%F %T %Z')"
echo "host UTC    : $(date -u '+%F %T')"
echo "contenedor  : $(docker run --rm --entrypoint date facylf-recolectores:local '+%F %T %Z')"
echo "contenedor U: $(docker run --rm --entrypoint date facylf-recolectores:local -u '+%F %T')"
echo

echo '── las últimas peticiones de cada federación, tal cual están escritas ──'
for f in "$RAIZ"/descargas-*/recolector-local/cola-v2.sqlite; do
  [ -f "$f" ] || continue
  fed=${f#*/descargas-}; fed=${fed%%/*}
  case "$fed" in prueba*|*-sondeo) continue ;; esac
  docker run --rm -v "$RAIZ:/app" --entrypoint node facylf-recolectores:local \
    -e "
      const { DatabaseSync } = require('node:sqlite');
      const d = new DatabaseSync('/app/descargas-$fed/recolector-local/cola-v2.sqlite', { readOnly: true });
      const r = d.prepare('select iniciada_en, dia_madrid from peticiones order by id desc limit 1').get();
      if (r) console.log('$fed'.padEnd(22) + r.iniciada_en + '  dia_madrid=' + r.dia_madrid);
      else console.log('$fed'.padEnd(22) + '(sin peticiones)');
    " 2>/dev/null
done
