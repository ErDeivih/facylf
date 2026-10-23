#!/bin/bash
# ── ¿ESTE GRUPO YA ESTÁ EN EL CANÓNICO? ─────────────────────────────────────────────────────────────────
#
# El importador declara «fallo» un grupo y lo reintenta, pero muchas veces el grupo SÍ entró: el registro dice
# «0 filas insertadas · 9.832 actualizadas · validación correcta en 1/1» para el grupo que acaba de marcar como
# fallido. Si el dato está, reintentarlo no arregla nada: sólo gasta horas de servidor. Antes de decidir hay que
# saber la verdad, y la verdad está en el canónico, no en el registro.
#
# Este guion contesta, para un grupo concreto:
#   · cuántos partidos tiene cargados en el canónico;
#   · si su edición tiene grupos y actas;
#   · y qué dice el punto de control de cobertura (si existe).
#
# Uso:  bash mira-grupo-en-canonico.sh <federacion> <temporada> <fuente_codigo_del_grupo>
# Ej.:  bash mira-grupo-en-canonico.sh baleares 2025-26 22628072
set -u
fed="${1:?falta la federación}"
temp="${2:?falta la temporada}"
grupo="${3:?falta el código de grupo en la fuente}"

# El operador `-c` con `count(*)` por ssh desde PowerShell es un dolor de cabeza; aquí va en un heredoc y a
# `psql` por la entrada estándar, que además deja el SQL legible.
docker exec -i facylf-postgres psql -U facylf_admin -d facylf -X <<SQL
\pset pager off
\echo === el grupo, por código de fuente ===
select pg.id as grupo_id, pg.nombre, pg.tipo, pg.jornadas_previstas, ce.categoria,
       s.etiqueta as temporada, f.codigo as federacion, count(m.id) as partidos
from core.phase_group pg
join core.competition_edition ce on ce.id = pg.competition_edition_id
join core.season s on s.id = ce.season_id
join core.federation f on f.id = ce.federation_id
left join core.match m on m.phase_group_id = pg.id
where f.codigo = '$fed' and s.etiqueta = '$temp' and pg.codigo_externo = '$grupo'
group by 1,2,3,4,5,6,7;

\echo === sus actas y sus filas de detalle ===
select count(distinct mr.match_id) as actas,
       count(distinct a.id) as apariciones,
       count(distinct e.id) as eventos
from core.phase_group pg
join core.match m on m.phase_group_id = pg.id
left join core.match_report mr on mr.match_id = m.id
left join core.appearance a on a.match_id = m.id
left join core.match_event e on e.match_id = m.id
where pg.codigo_externo = '$grupo';

\echo === el punto de control de cobertura, si lo tiene ===
select cp.visibility_state, cp.completitud_historica, cp.jornadas_esperadas, cp.jornadas_cerradas,
       cp.partidos_con_resultado, cp.actas_parseadas, cp.actas_correctas, cp.calculado_en
from ops.coverage_checkpoint cp
join core.phase_group pg on pg.id = cp.phase_group_id
where pg.codigo_externo = '$grupo';
SQL
