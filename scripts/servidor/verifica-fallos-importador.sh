#!/bin/bash
# Ritmo del importador y verificación de sus "fallos": ¿son reales o falsos negativos?
echo "=== GRUPOS IMPORTADOS POR HORA (del registro del importador) ==="
docker logs --since 8h facylf-importador 2>&1 | grep -E '  hecho ' | awk '{print substr($1,1,13)}' | sort | uniq -c | tail -12
echo
echo "=== ULTIMOS 12 'HECHO' (federacion | filas | segundos) ==="
docker logs --since 8h facylf-importador 2>&1 | grep -E '  hecho ' | tail -12
echo
echo "=== ULTIMOS 8 'FALLO' ==="
docker logs --since 8h facylf-importador 2>&1 | grep -E '  fallo ' | tail -8
echo
echo "=== ¿ESTAN ESOS GRUPOS EN EL CANONICO? ==="
cd /srv/data/facylf 2>/dev/null || true
bash scripts/servidor/psql-canonico.sh "
select f.codigo as federacion, s.etiqueta, pg.codigo_externo as grupo,
       count(distinct m.id) as partidos,
       count(distinct m.id) filter (where m.goles_local is not null) as con_resultado
from core.phase_group pg
join core.competition_edition ce on ce.id = pg.competition_edition_id
join core.season s on s.id = ce.season_id
join core.federation f on f.id = ce.federation_id
left join core.match m on m.phase_group_id = pg.id
where pg.codigo_externo in ('23200330','23269525','23276060','23198229','45693190','45693321','45942639','45983670')
group by 1,2,3 order by 1" 2>&1 | head -20
