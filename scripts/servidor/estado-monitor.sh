#!/bin/bash
# Lo que el monitor ya tiene calculado: peticiones y fallos por federación. Es el ritmo real, sin volver a
# barrer las colas (que es justo lo que está costando CPU).
echo "=== FICHEROS DE ESTADO DEL MONITOR ==="
find /srv/data/facylf -maxdepth 3 -path '*estado*' -name '*.json' -newermt '-30 minutes' 2>/dev/null | head -10
echo
echo "=== CONTENIDO (resumido) ==="
for f in $(find /srv/data/facylf -maxdepth 3 -path '*estado*' -name '*.json' 2>/dev/null | head -6); do
  echo "--- $f"
  ls -l "$f"
  head -c 1200 "$f"
  echo
done
echo
echo "=== ¿QUE HACE EL MONITOR? (procesos y su CPU) ==="
docker exec facylf-monitor sh -c 'ps -eo pcpu,etimes,args 2>/dev/null | head -12' 2>&1 | cut -c1-150
echo
echo "=== CADENCIA DEL MONITOR ==="
docker exec facylf-monitor printenv 2>/dev/null | grep -i 'FACYLF' | head -12
echo
echo "=== ULTIMAS LINEAS DEL MONITOR ==="
docker logs --tail 8 facylf-monitor 2>&1 | cut -c1-160
