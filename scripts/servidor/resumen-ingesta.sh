#!/bin/bash
# Resumen de la ingesta en el SERVIDOR: ritmo, errores y estado.
echo "=== FECHA Y CARGA ==="
date '+%Y-%m-%d %H:%M'
uptime
echo
echo "=== RECOLECTORES ==="
arriba=0
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja; do
  s=$(timeout 20 docker inspect -f '{{.State.Status}}' "facylf-$fed-1" 2>/dev/null)
  [ "$s" = "running" ] && arriba=$((arriba+1))
done
echo "  $arriba de 16 en marcha (cataluna, madrid y valencia las recoge el PC)"
for c in facylf-postgres facylf-web facylf-importador facylf-monitor; do
  printf '  %-20s %s\n' "$c" "$(timeout 20 docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null)"
done
echo
echo "=== RITMO: PETICIONES Y FALLOS POR FEDERACION (ultima vuelta del monitor) ==="
docker logs --tail 40 facylf-monitor 2>&1 | grep -E 'trabajando|sin-trabajo' | awk '{printf "%-20s %-12s pet=%-5s fallos=%s\n", $1, $2, $3, $4}' | sort -u
echo
echo "=== IMPORTACION AL CANONICO ==="
cat /srv/data/facylf/estado/importacion-resumen.json 2>/dev/null
echo
echo "=== ULTIMOS MOVIMIENTOS DEL IMPORTADOR ==="
docker logs --tail 8 facylf-importador 2>&1 | tail -8
echo
echo "=== AVISOS DEL MONITOR ==="
docker logs --tail 60 facylf-monitor 2>&1 | grep -iE 'aviso|atascada|no responde|oom' | tail -6 || echo "  sin avisos"
echo
echo "=== RECURSOS ==="
free -g | head -2
echo -n "  iowait: "; vmstat 1 2 2>/dev/null | tail -1 | awk '{print $16"%"}'
echo -n "  fichas de plaza ocupadas: "; timeout 25 docker exec facylf-murcia-1 sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null
echo "  colas: $(ls -d /srv/ssd/facylf/*/cola-v2.sqlite 2>/dev/null | wc -l) en SSD"
echo
echo "=== CANONICO ==="
echo -n "  personas: "; timeout 40 docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc 'select count(*) from core.person' 2>&1 | head -1
echo -n "  partidos: "; timeout 40 docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc 'select count(*) from core.match' 2>&1 | head -1
