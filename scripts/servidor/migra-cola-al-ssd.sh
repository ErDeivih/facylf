#!/bin/bash
# Migra UNA cola del HDD mecánico (/srv/data, disco sdb) al SSD (/srv/ssd -> sda3), con el mismo patrón de
# enlace simbólico que ya usan las nueve federaciones migradas el 23/09.
#
# POR QUÉ: medido el 25/09/2026, el cuello del servidor no es la CPU (3,5 de 4 núcleos, cuotas respetadas) sino
# la E/S: 23-28 procesos bloqueados y 17-22 % de iowait, con 19 colas de ~700 MB en un disco MECÁNICO
# (sdb: WDC WD5000LPVX, 5400 rpm) mientras el SSD tiene sitio de sobra (165 GB libres).
#
# NUNCA se copia una SQLite viva: se para el contenedor, se mueve, se enlaza y se arranca. La parada y el
# arranque se hacen con `docker stop/start` (no con compose), para NO recrear el contenedor y no perder su
# cuota de CPU ni su turno.
set -e
FED="${1:?uso: migra-cola-al-ssd.sh <federacion>}"
ORIGEN="/srv/data/facylf/descargas-$FED/recolector-local/cola-v2.sqlite"
DESTINO_DIR="/srv/ssd/facylf/$FED"
DESTINO="$DESTINO_DIR/cola-v2.sqlite"
CONT="facylf-$FED-1"

echo "=== COMPROBACIONES PREVIAS ($FED) ==="
if [ -L "$ORIGEN" ]; then echo "  ya es un enlace al SSD: nada que hacer"; exit 0; fi
[ -f "$ORIGEN" ] || { echo "  no existe $ORIGEN"; exit 1; }
ls -l "$ORIGEN" | sed 's/^/  /'
echo -n "  espacios libres: "; df -h /srv/ssd | tail -1 | awk '{print $4}'
docker ps --filter "name=^$CONT$" --format '  contenedor: {{.Names}} {{.Status}}'

echo
echo "=== 1. PARAR EL RECOLECTOR (cierre en limpio) ==="
docker stop -t 60 "$CONT" >/dev/null 2>&1 && echo "  parado" || { echo "  no se pudo parar: se aborta sin tocar nada"; exit 1; }
sleep 2
docker ps --filter "name=^$CONT$" --format '  sigue arriba: {{.Names}}' || true

echo
echo "=== 2. MOVER LA COLA COMPLETA (sqlite + wal + shm) ==="
mkdir -p "$DESTINO_DIR"
for sufijo in "" "-wal" "-shm"; do
  if [ -e "$ORIGEN$sufijo" ]; then
    mv "$ORIGEN$sufijo" "$DESTINO$sufijo"
    echo "  movido $sufijo"
  fi
done
ls -l "$DESTINO"* | sed 's/^/  /'

echo
echo "=== 3. DEJAR EL ENLACE EN SU SITIO DE SIEMPRE ==="
ln -s "$DESTINO" "$ORIGEN"
ls -l "$ORIGEN" | sed 's/^/  /'

echo
echo "=== 4. ARRANCAR EL RECOLECTOR ==="
docker start "$CONT" >/dev/null 2>&1 && echo "  arrancado" || { echo "  NO ARRANCA"; exit 1; }
sleep 12
docker ps --filter "name=^$CONT$" --format '  estado: {{.Names}} {{.Status}}'

echo
echo "=== 5. ¿LEE BIEN SU COLA? (últimas líneas del contenedor) ==="
docker logs --tail 6 "$CONT" 2>&1 | cut -c1-140
echo
echo "(si no dice nada, es que está trabajando en silencio: se comprueba en la siguiente medición)"
