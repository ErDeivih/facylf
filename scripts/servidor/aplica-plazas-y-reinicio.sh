#!/bin/bash
# A) Que la base, la web, el importador, el monitor y los recolectores VUELVAN SOLOS tras un reinicio.
# B) Bajar las plazas de navegador de 16 a 5, que es lo que aguanta un servidor de 4 núcleos.
#
# POR QUÉ 5 PLAZAS Y POR QUÉ SE TOCA `FACYLF_MEMORIA_GB`:
#   · las plazas salen de `repartePlazas`: plazas = (presupuesto − 1,5) / 0,75. Con 14 GB salen 16 plazas, porque
#     el reparto se dimensiona por MEMORIA y nunca ha mirado la CPU;
#   · medido con `docker stats`: cada navegador en faena consume 0,55-0,70 núcleos. En 4 núcleos, dejando uno
#     para el importador, Postgres, la web y el sistema, caben CINCO;
#   · (5,25 − 1,5) / 0,75 = 5 plazas exactas. La reserva de aire no cambia: `RESERVA_AIRE_GB` sólo mira si la
#     variable está declarada (vale 0,25 con ella puesta), no su valor;
#   · el techo REAL de memoria de la rebanada es `FACYLF_SLICE_GB=14`, que va aparte y no se toca.
cd /srv/data/facylf || exit 1
FICH="--env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml"

echo "=== A. POLITICA DE REINICIO ==="
for c in facylf-postgres facylf-web facylf-importador facylf-monitor; do
  antes=$(timeout 25 docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null)
  docker update --restart unless-stopped "$c" >/dev/null 2>&1
  despues=$(timeout 25 docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null)
  printf '  %-22s %s -> %s\n' "$c" "${antes:-?}" "${despues:-?}"
done
echo "  --- recolectores ---"
for c in $(timeout 120 docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^facylf-.*-1$'); do
  docker update --restart unless-stopped "$c" >/dev/null 2>&1
done
echo -n "  recolectores con politica puesta: "
for c in $(timeout 120 docker ps --format '{{.Names}}' 2>/dev/null | grep -E '^facylf-.*-1$'); do
  timeout 15 docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$c" 2>/dev/null
done | grep -c unless-stopped

echo
echo "=== B. PLAZAS: DE 16 A 5 ==="
echo -n "  .env antes: "; grep '^FACYLF_MEMORIA_GB=' docker/.env
sed -i 's/^FACYLF_MEMORIA_GB=.*/FACYLF_MEMORIA_GB=5.25/' docker/.env
echo -n "  .env ahora: "; grep '^FACYLF_MEMORIA_GB=' docker/.env
echo -n "  .env techo de memoria (no se toca): "; grep '^FACYLF_SLICE_GB=' docker/.env

echo
echo "=== FICHAS DE PLAZA ANTES ==="
timeout 25 docker exec facylf-murcia-1 sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null
echo -n "  navegadores: "; pgrep -c chrome 2>/dev/null || echo 0
uptime

echo
echo "=== RECREAR ESCALONADO (grupos de cinco, con pausas) ==="
for grupo in "andalucia aragon asturias baleares canarias" "cantabria castilla-la-mancha ceuta euskadi extremadura" "federacion galicia melilla murcia navarra" "rioja"; do
  echo "--- $grupo"
  timeout 600 docker compose -p facylf $FICH up -d $grupo 2>&1 | grep -cE 'Started|Created|Recreated' | sed 's/^/    contenedores tocados: /'
  sleep 35
  uptime
done

echo
echo "=== DESPUES ==="
sleep 30
echo -n "  .env: "; grep '^FACYLF_MEMORIA_GB=' docker/.env
echo -n "  ficheros de plaza (deben bajar a 5 como mucho): "
timeout 25 docker exec facylf-murcia-1 sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null
echo -n "  navegadores: "; pgrep -c chrome 2>/dev/null || echo 0
echo -n "  contenedores arriba: "; timeout 120 docker ps -q 2>/dev/null | wc -l
uptime
