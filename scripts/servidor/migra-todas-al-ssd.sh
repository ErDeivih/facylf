#!/bin/bash
# Migra al SSD las colas que siguen en el disco mecánico, una a una y comprobando cada una.
# Se apoya en `migra-cola-al-ssd.sh`, que ya se probó con Galicia. No usa `set -e` global a propósito: si una
# federación falla, las demás siguen y al final se ve cuál quedó.
for fed in murcia extremadura federacion navarra canarias rioja euskadi ceuta melilla; do
  echo "════════════════════════════════ $fed ════════════════════════════════════"
  if bash /tmp/migra-cola.sh "$fed" 2>&1 | tail -12; then
    estado=$(docker ps --filter "name=^facylf-$fed-1$" --format '{{.Status}}')
    echo "  >>> $fed: ${estado:-NO ARRANCO}"
  else
    echo "  >>> $fed: FALLO (revisar)"
  fi
  echo
done

echo "════════════════════════════════ RESUMEN ════════════════════════════════════"
echo -n "colas en el SSD:  "; ls -d /srv/ssd/facylf/*/cola-v2.sqlite 2>/dev/null | wc -l
echo -n "colas en el HDD:  "; ls -l /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | grep -vc '^l'
echo
echo "=== ¿SIGUEN TODOS ARRIBA? ==="
docker ps --filter 'name=facylf-' --format '{{.Names}} {{.Status}}' | sort
