#!/bin/bash
# ── ¿CUÁNTOS DE LOS GRUPOS «FALLIDOS» YA ESTÁN IMPORTADOS? ──────────────────────────────────────────────
#
# El 01/10/2026 se cazó al importador girando **dos horas** sobre el grupo `baleares|2025-26|22628072` con el
# grupo YA COMPLETO en el canónico: 240 partidos, 240 actas, 8.272 apariciones y su punto de control de cobertura
# en `completa`. Lo dio por hecho, lo escribió, y acto seguido lo marcó como fallo y se puso a repetirlo.
#
# Si eso pasa en muchos grupos, el importador no está «yendo lento»: está gastando el servidor en rehacer trabajo
# hecho, y la lista de 13.000 pendientes no baja porque buena parte de ella ya está dentro. Eso cambia por
# completo lo que hay que arreglar, así que hay que contarlo antes de tocar nada.
#
# Este guion cruza las unidades marcadas como fallo (y las ya hechas, como control) con la cobertura del canónico
# y dice cuántas están COMPLETAS. SÓLO LEE.
#
# Uso:  bash cuantos-fallidos-ya-estan.sh [fallos|hechos|apartados]
set -u
lista="${1:-fallos}"
estado="${FACYLF_ESTADO_IMPORTACION:-/srv/data/facylf/estado/importacion.json}"

if [ ! -f "$estado" ]; then echo "no encuentro el estado del importador en $estado"; exit 1; fi

# Las claves del estado son `federacion|temporada|grupo`. Se convierten a CSV en un contenedor node (el host no
# tiene node) y se pasan por un fichero, no por la línea de órdenes: son miles de claves.
cat > /tmp/lee-claves.mjs <<'JS'
import { readFileSync } from 'node:fs';
const e = JSON.parse(readFileSync('/e.json', 'utf8'));
const lista = process.argv[2];
const claves = Object.keys(e[lista] ?? {});
for (const k of claves) console.log(k.replace(/\|/g, ','));
console.error(`(${claves.length} claves en «${lista}»)`);
JS
docker run --rm -v "$estado:/e.json:ro" -v /tmp/lee-claves.mjs:/lee.mjs:ro \
  node:22-alpine node /lee.mjs "$lista" > /tmp/claves.csv

total=$(grep -c . /tmp/claves.csv || true)
echo "unidades en la lista «$lista»: $total"
[ "$total" -eq 0 ] && { echo "nada que cruzar"; exit 0; }

docker cp /tmp/claves.csv facylf-postgres:/tmp/claves.csv >/dev/null

docker exec -i facylf-postgres psql -U facylf_admin -d facylf -X <<SQL
\pset pager off
create temp table unidades(fed text, temp text, grupo text);
\copy unidades from '/tmp/claves.csv' with (format csv)

-- OJO con el join directo: una federación tiene VARIAS ediciones por temporada (Primera, Segunda, Provincial…),
-- así que unir por (federación, temporada, código de grupo) multiplica las filas y da cuentas infladas — el
-- primer intento dio 5.796 unidades donde había 173. Se cuenta por unidad con subconsultas, no con joins.
create temp view por_unidad as
select distinct u.fed, u.temp, u.grupo,
  (select cp.visibility_state
     from core.federation f
     join core.competition_edition ce on ce.federation_id = f.id
     join core.season s on s.id = ce.season_id
     join core.phase_group pg on pg.competition_edition_id = ce.id
     left join ops.coverage_checkpoint cp on cp.phase_group_id = pg.id
    where f.codigo = u.fed and s.etiqueta = u.temp and pg.codigo_externo = u.grupo
    limit 1) as cobertura,
  exists (select 1
     from core.federation f
     join core.competition_edition ce on ce.federation_id = f.id
     join core.season s on s.id = ce.season_id
     join core.phase_group pg on pg.competition_edition_id = ce.id
    where f.codigo = u.fed and s.etiqueta = u.temp and pg.codigo_externo = u.grupo) as esta
from unidades u;

\echo === cuántas de esas unidades están YA COMPLETAS en el canónico ===
select count(*) as unidades,
       count(*) filter (where esta) as estan_en_el_canonico,
       count(*) filter (where cobertura = 'completa') as ya_completas,
       count(*) filter (where not esta) as no_estan,
       round(100.0 * count(*) filter (where cobertura = 'completa') / greatest(count(*), 1)) as pct_ya_completas
from por_unidad;

\echo === el detalle por federación ===
select fed, count(*) as unidades,
       count(*) filter (where cobertura = 'completa') as ya_completas,
       count(*) filter (where not esta) as no_estan
from por_unidad group by fed order by unidades desc;

\echo === y qué estados de cobertura tienen las que SÍ están ===
select coalesce(cobertura, '(sin punto de control)') as estado, count(*)
from por_unidad where esta group by 1 order by 2 desc;
SQL
