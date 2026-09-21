#!/usr/bin/env bash
# Comprueba los permisos del canónico en el servidor: el rol de lectura lee y NO escribe.
# Va como guion y no como línea suelta porque PowerShell se come las comillas al pasar por ssh, y con
# paréntesis en una consulta SQL la orden llega rota al shell remoto.
set -uo pipefail

CONTENEDOR=facylf-postgres

echo "── lectura (tiene que funcionar) ──"
docker exec -i "$CONTENEDOR" psql -U facylf_lector -d facylf -tA <<'SQL'
select 'federaciones: ' || count(*) from core.federation;
select 'tablas visibles en core: ' || count(*) from information_schema.tables where table_schema = 'core';
SQL

echo "── escritura (tiene que fallar) ──"
docker exec -i "$CONTENEDOR" psql -U facylf_lector -d facylf 2>&1 <<'SQL' | head -3
create table core.prueba_lector(x int);
SQL

echo "── el publicador sí escribe, pero sólo en su ámbito ──"
docker exec -i "$CONTENEDOR" psql -U facylf_publicador -d facylf -tA <<'SQL'
select 'publicador: puede leer core.person = ' || count(*) from core.person;
SQL

echo "── esquemas y tablas ──"
docker exec -i "$CONTENEDOR" psql -U facylf_admin -d facylf -tA <<'SQL'
select 'esquema ' || table_schema || ': ' || count(*) || ' tablas'
from information_schema.tables
where table_schema in ('core', 'ops', 'source', 'analytics')
group by 1 order by 1;
select 'migraciones aplicadas: ' || count(*) from ops.migracion;
SQL
