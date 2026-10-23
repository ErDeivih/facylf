#!/bin/bash
# ¿Está el servidor activo y recolectando? Foto de ahora.
echo "=== FECHA Y CARGA ==="
date
uptime
echo -n "procesos: "; ps -e --no-headers 2>/dev/null | wc -l
echo
echo "=== SERVICIOS CLAVE ==="
for c in facylf-postgres facylf-web facylf-importador facylf-monitor; do
  printf '  %-22s %s\n' "$c" "$(timeout 25 docker inspect -f '{{.State.Status}} (desde {{.State.StartedAt}})' "$c" 2>/dev/null || echo 'SIN RESPUESTA')"
done
echo
echo "=== RECOLECTORES ==="
arriba=0; total=0
for fed in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha cataluna ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia; do
  s=$(timeout 20 docker inspect -f '{{.State.Status}}' "facylf-$fed-1" 2>/dev/null)
  total=$((total+1))
  [ "$s" = "running" ] && arriba=$((arriba+1))
  printf '  %-22s %s\n' "$fed" "${s:-?}"
done
echo "  --- $arriba de $total en marcha ---"
echo
echo "=== ¿RECOLECTANDO AHORA? (última vuelta del monitor) ==="
docker logs --tail 30 facylf-monitor 2>&1 | grep -E 'trabajando|sin-trabajo' | awk '{printf "  %-20s pet=%-5s fallos=%s\n", $1, $3, $4}' | sort -u
echo
echo "=== MEMORIA, DISCO Y E/S ==="
free -g | head -2
df -h /srv/ssd /srv/data 2>/dev/null | sed 's/  */ /g' | tail -2
echo -n "  iowait: "; vmstat 1 2 2>/dev/null | tail -1 | awk '{print $16"%"}'
echo
echo "=== LA WEB ==="
code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' http://127.0.0.1:3100 2>/dev/null)
echo "  http://127.0.0.1:3100 -> ${code:-(sin respuesta)}"
echo -n "  canónico: "; timeout 40 docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc 'select count(*) from core.person' 2>&1 | head -1
echo
echo "=== ÚLTIMOS FALLOS DEL MONITOR ==="
docker logs --tail 12 facylf-monitor 2>&1 | grep -iE 'aviso|atascada|error' | tail -6 || echo "  sin avisos"
