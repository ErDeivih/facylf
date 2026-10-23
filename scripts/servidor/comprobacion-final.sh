#!/bin/bash
# Comprobación final: la base, la web, el monitor, el importador y la flota entera.
echo "=== CARGA ==="
uptime
echo -n "procesos: "; ps -e --no-headers 2>/dev/null | wc -l
echo
echo "=== SERVICIOS CLAVE ==="
for c in facylf-postgres facylf-web facylf-importador facylf-monitor; do
  printf '  %-22s %s\n' "$c" "$(timeout 25 docker inspect -f '{{.State.Status}}' "$c" 2>/dev/null || echo '?')"
done
echo
echo "=== ¿RESPONDE EL CANONICO? ==="
timeout 60 docker exec facylf-postgres psql -U facylf_admin -d facylf -Atc 'select count(*) from core.person' 2>&1 | head -2
echo
echo "=== ¿RESPONDE LA WEB? ==="
puerto=$(timeout 25 docker inspect -f '{{range $p, $conf := .NetworkSettings.Ports}}{{$p}} {{end}}' facylf-web 2>/dev/null | tr ' ' '\n' | head -1)
echo "  puerto publicado: ${puerto:-(ninguno)}"
for u in http://127.0.0.1:3000 http://127.0.0.1:3001; do
  code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$u" 2>/dev/null)
  [ "$code" = "200" ] && echo "  $u -> $code" && break
done
echo
echo "=== RECOLECTORES ARRIBA ==="
timeout 150 docker ps --format '{{.Names}}' 2>/dev/null | grep -c '^facylf-.*-1$'
echo
echo "=== ¿ESTAN PIDIENDO? (ultima vuelta del monitor) ==="
docker logs --tail 40 facylf-monitor 2>&1 | grep -E 'trabajando|sin-trabajo|avisos|memoria:' | tail -22
