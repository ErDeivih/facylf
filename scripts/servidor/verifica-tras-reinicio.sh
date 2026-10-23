#!/bin/bash
# El arreglo del importador de ayer, ¿sigue en su sitio tras el reinicio? ¿Y por dónde va la importación?
echo "=== EL ARREGLO DEL IMPORTADOR ESTA EN EL SERVIDOR? ==="
grep -c 'entroEntero' /srv/data/facylf/scripts/importar-masivo.mjs 2>/dev/null | sed 's/^/  referencias al criterio nuevo: /'
grep -c 'motivoDeSalida' /srv/data/facylf/scripts/importar-masivo.mjs 2>/dev/null | sed 's/^/  motivoDeSalida definido y usado: /'
echo
echo "=== AJUSTE DE PLAZAS: ¿SIGUE EN 5? ==="
grep -E '^FACYLF_MEMORIA_GB=' /srv/data/facylf/docker/.env | sed 's/^/  /'
echo -n "  plazas que reparte ahora mismo: "
timeout 25 docker exec facylf-murcia-1 sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null
echo
echo "=== IMPORTACION: POR DONDE VA ==="
cat /srv/data/facylf/estado/importacion-resumen.json 2>/dev/null
echo
echo "=== COLA DE LA ULTIMA TANDA DEL IMPORTADOR ==="
docker logs --tail 6 facylf-importador 2>&1 | cut -c1-150
echo
echo "=== COLAS EN SSD O EN HDD ==="
echo -n "  en el SSD: "; ls -d /srv/ssd/facylf/*/cola-v2.sqlite 2>/dev/null | wc -l
echo -n "  aun en el HDD: "; ls -l /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | grep -vc '^l'
