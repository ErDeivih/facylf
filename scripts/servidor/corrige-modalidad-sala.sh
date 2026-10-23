#!/usr/bin/env bash
# ── CORRIGE LAS EDICIONES MARCADAS COMO FÚTBOL SALA POR ERROR ──────────────────────────────────────────────
#
# `modalidadDesdeNombre` buscaba «sala» como subcadena, así que «… Primera - Salamanca» quedaba como fútbol
# sala: los informes asumían 5 jugadores y no calculaban minutos (arreglado el 30/09/2026 en
# packages/canonico/src/origen/vocabularios.ts, con su prueba). Lo ya importado no se corrige solo hasta que
# se reimporte cada grupo; esto recalcula la modalidad de esas ediciones con la MISMA regla que el código.
#
# Sin argumentos SÓLO ENSEÑA lo que cambiaría. Con --aplicar lo hace en una transacción.
# Uso: bash scripts/servidor/corrige-modalidad-sala.sh [--aplicar]
set -uo pipefail
cd /srv/data/facylf || exit 1
url="$(grep -m1 '^DATABASE_URL_PUBLICADOR=' docker/.env | cut -d= -f2- | tr -d '"'"'"'')"
if [ -z "$url" ]; then echo 'no encuentro DATABASE_URL_PUBLICADOR en docker/.env' >&2; exit 1; fi
resto="${url#*://}"; credenciales="${resto%%@*}"
usuario="${credenciales%%:*}"; clave="${credenciales#*:}"
base="${resto#*@}"; base="${base##*/}"; base="${base%%\?*}"
fin='rollback'; [ "${1:-}" = '--aplicar' ] && fin='commit'

docker exec -i -e PGPASSWORD="$clave" facylf-postgres psql -U "$usuario" -d "$base" -h 127.0.0.1 -X -q -v ON_ERROR_STOP=1 <<SQL
begin;
create temp table cambio on commit drop as
select ce.id, f.codigo federacion, ce.nombre_publicado,
       case when lower(ce.nombre_publicado) ~ 'playa' then 'playa'
            when lower(ce.nombre_publicado) ~ 'f[uú]tbol\s*8|f-?8' then 'futbol8'
            when lower(ce.nombre_publicado) ~ 'f[uú]tbol\s*7|f-?7' then 'futbol7'
            else 'desconocida' end as nueva
from core.competition_edition ce join core.federation f on f.id = ce.federation_id
where ce.modalidad = 'sala'
  and lower(ce.nombre_publicado) !~ 'f[uú]tbol\s*sala|futsal|aret?o\s*futbol|(^|[^a-z0-9áéíóúàèòïüñç])sala($|[^a-z0-9áéíóúàèòïüñç])';
select federacion, nueva, count(*) ediciones, min(nombre_publicado) ejemplo from cambio group by 1,2 order by 3 desc;
update core.competition_edition ce set modalidad = c.nueva from cambio c where c.id = ce.id;
$fin;
SQL
echo "terminado con: $fin"
