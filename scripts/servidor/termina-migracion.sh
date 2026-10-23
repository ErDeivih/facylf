#!/bin/bash
# 1) Foto del estado ya asentado.  2) Migrar al SSD las tres colas que quedan en el disco mecánico.
echo "=== ESTADO ASENTADO ==="
uptime
echo -n "contenedores arriba: "; timeout 120 docker ps -q 2>/dev/null | wc -l
echo "=== PETICIONES (ultima vuelta del monitor) ==="
docker logs --tail 30 facylf-monitor 2>&1 | grep -E 'trabajando|sin-trabajo' | awk '{printf "  %-20s %-12s pet=%s fallos=%s\n", $1, $2, $3, $4}' | head -20
echo
echo "=== MIGRAR LAS TRES QUE QUEDAN ==="
for fed in euskadi ceuta melilla; do
  echo "--- $fed"
  bash /tmp/migra-cola.sh "$fed" 2>&1 | grep -E 'FICHERO|enlace|parado|movido|arrancado|estado:|NO' | head -8
done
echo
echo "=== COMO QUEDAN LAS COLAS ==="
for f in /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite; do
  [ -e "$f" ] || continue
  fed=$(printf '%s' "$f" | sed 's|/srv/data/facylf/descargas-||; s|/recolector-local.*||')
  if [ -L "$f" ]; then printf '  %-22s SSD\n' "$fed"; else printf '  %-22s HDD\n' "$fed"; fi
done
echo
echo "=== ESTADO DE LOS TRES ==="
for fed in euskadi ceuta melilla; do
  printf '  %-12s %s\n' "$fed" "$(timeout 25 docker inspect -f '{{.State.Status}}' facylf-$fed-1 2>/dev/null || echo '?')"
done
uptime
