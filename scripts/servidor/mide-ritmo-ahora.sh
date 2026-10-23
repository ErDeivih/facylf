#!/bin/bash
# ¿Avanza el importador? ¿A qué ritmo crece el canónico? Dos muestras separadas en el tiempo.
cd /srv/data/facylf 2>/dev/null || true
CONSULTA="select f.codigo as federacion, sum(c.actas_parseadas) as actas, sum(c.partidos_con_resultado) as partidos
from ops.coverage_checkpoint c
join core.phase_group pg on pg.id = c.phase_group_id
join core.competition_edition ce on ce.id = pg.competition_edition_id
join core.federation f on f.id = ce.federation_id
group by 1 order by 2 desc nulls last"

echo "=== IMPORTADOR: ultima linea y procesos dentro del contenedor ==="
docker logs --tail 1 facylf-importador 2>&1 | tail -1
docker exec facylf-importador sh -c 'ps -eo pid,etimes,comm,args 2>/dev/null | grep -E "tsx|node" | grep -v grep | head -6' 2>&1
echo
echo "=== MUESTRA 1 ($(date +%H:%M:%S)) ==="
bash scripts/servidor/psql-canonico.sh "$CONSULTA" 2>&1 | head -25
echo
sleep 180
echo "=== MUESTRA 2 ($(date +%H:%M:%S), 3 minutos despues) ==="
bash scripts/servidor/psql-canonico.sh "$CONSULTA" 2>&1 | head -25
echo
echo "=== IMPORTADOR: ultima linea despues de la espera ==="
docker logs --tail 1 facylf-importador 2>&1 | tail -1
