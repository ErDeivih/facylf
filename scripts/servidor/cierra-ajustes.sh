#!/bin/bash
# 1) Dejar escrito en el .env POR QUÉ el presupuesto de plazas es 5,25 (que el siguiente no lo «arregle» a 14).
# 2) Subir el importador arreglado y reiniciarlo.
# 3) Medir el efecto del ajuste de plazas.
cd /srv/data/facylf || exit 1

echo "=== 1. DEJAR EL MOTIVO ESCRITO EN EL .env ==="
if ! grep -q 'PLAZAS: EL PRESUPUESTO ES DE CPU' docker/.env; then
  sed -i 's|^FACYLF_MEMORIA_GB=.*|# PLAZAS: EL PRESUPUESTO ES DE CPU, NO DE MEMORIA (25/09/2026)\n# plazas = (FACYLF_MEMORIA_GB - 1,5) / 0,75. Con 14 GB salían 16 plazas, y este servidor tiene 4 NÚCLEOS:\n# medido con `docker stats`, cada navegador en faena gasta 0,55-0,70 núcleos, así que dejando uno para el\n# importador, Postgres, la web y el sistema sólo caben CINCO. (5,25 - 1,5) / 0,75 = 5 exactas.\n# El techo REAL de memoria de la rebanada es FACYLF_SLICE_GB=14, que va aparte y NO se toca.\nFACYLF_MEMORIA_GB=5.25|' docker/.env
  echo "  anotado"
else
  echo "  ya estaba anotado"
fi
grep -A1 'PLAZAS' docker/.env | head -3

echo
echo "=== 2. IMPORTADOR ARREGLADO ==="
docker restart facylf-importador >/dev/null 2>&1 && echo "  reiniciado"
sleep 20
docker inspect -f '  estado={{.State.Status}}' facylf-importador 2>/dev/null
echo "  (el arreglo: un grupo que entra entero con código 1 se cuenta como HECHO; el timeout se dice; el motivo guardado son las líneas de error, no el resumen)"

echo
echo "=== 3. EFECTO DEL AJUSTE DE PLAZAS ==="
uptime
echo -n "  fichas de plaza ocupadas: "
timeout 25 docker exec facylf-murcia-1 sh -c 'ls /app/.estado-workers/slots-chrome 2>/dev/null | wc -l' 2>/dev/null
echo -n "  procesos de navegador:    "; pgrep -c chrome 2>/dev/null || echo 0
echo -n "  contenedores arriba:      "; timeout 120 docker ps -q 2>/dev/null | wc -l
echo
echo "=== PETICIONES POR FEDERACION (ultima vuelta del monitor) ==="
docker logs --tail 30 facylf-monitor 2>&1 | grep -E 'trabajando|sin-trabajo' | awk '{printf "  %-20s pet=%-5s fallos=%s\n", $1, $3, $4}' | sort -u | head -22
echo
echo "=== CPU POR CONTENEDOR ==="
timeout 120 docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' 2>/dev/null | sort -k2 -nr | head -8
echo
echo "=== MEMORIA Y DISCO ==="
free -g | head -2
echo -n "  iowait: "; vmstat 1 2 2>/dev/null | tail -1 | awk '{print $16"%"}'
