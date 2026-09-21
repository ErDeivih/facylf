#!/usr/bin/env bash
# Estado de la importación masiva en el servidor: qué ha hecho el importador y cómo va el canónico.
set -uo pipefail

echo "── registro del importador (últimas líneas útiles) ──"
docker logs facylf-importador 2>&1 | grep -E 'hecho |apartad|fallo |tanda terminada|importación masiva' | tail -8

echo
echo "── canónico del servidor ──"
docker exec -i facylf-postgres psql -U facylf_admin -d facylf -tA <<'SQL'
select 'partidos: ' || count(*) from core.match;
select 'informes: ' || count(*) from core.match_report;
select 'personas: ' || count(*) from core.person;
select 'lotes: ' || count(*) from ops.batch;
select 'filas rechazadas: ' || count(*) from ops.batch where jsonb_typeof(validacion) = 'object';
SQL

echo
echo "── estado del lanzador ──"
cat /srv/data/facylf/estado/importacion-resumen.json 2>/dev/null || echo "(todavía sin resumen)"

echo
echo "── fallos y apartados del lanzador ──"
echo "  líneas de fallo:  $(docker logs facylf-importador 2>&1 | grep -c 'fallo ' || true)"
echo "  líneas de apartado: $(docker logs facylf-importador 2>&1 | grep -c 'Apartado' || true)"
echo "  últimos fallos:"
docker logs facylf-importador 2>&1 | grep 'fallo ' | tail -4 | sed 's/^/    /'
echo "  últimos apartados:"
docker logs facylf-importador 2>&1 | grep 'Apartado' | tail -3 | sed 's/^/    /'

echo
echo "── contenedores de facylf ──"
docker ps --filter name=facylf --format '  {{.Names}} · {{.Status}}'
