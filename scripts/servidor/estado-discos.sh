#!/usr/bin/env bash
# ¿Dónde están los datos y cabe mover lo que más escribe al disco rápido?
#
# Medido el 22/09/2026: el servidor tiene un SSD (sda, 223 GB, ROTA=0) y un DISCO DURO (sdb, 465 GB, ROTA=1), y
# `/srv/data` —donde viven las colas, el archivo y el volumen de PostgreSQL— está en el disco DURO. Con 12
# navegadores escribiendo en sus colas, el importador machacando PostgreSQL y la copia de seguridad leyendo,
# el 47 % del tiempo del procesador era ESPERA DE DISCO. Esto mira qué se podría mover y cuánto sitio hay.
set -uo pipefail

echo "── discos ──"
lsblk -o NAME,SIZE,ROTA,MOUNTPOINT | sed 's/^/  /'

echo
echo "── montajes ──"
mount | grep -E '/dev/sd' | sed 's/^/  /'

echo
echo "── espacio por sistema de ficheros ──"
df -h -x tmpfs -x devtmpfs | sed 's/^/  /'

echo
echo "── volúmenes de Docker ──"
for v in $(docker volume ls --format '{{.Name}}'); do
  punto=$(docker volume inspect -f '{{.Mountpoint}}' "$v" 2>/dev/null)
  tam=$(sudo du -sh "$punto" 2>/dev/null | cut -f1)
  printf '  %-28s %8s  %s\n' "$v" "${tam:-?}" "$punto"
done

echo
echo "── lo que más pesa en /srv/data ──"
sudo du -sh /srv/data/facylf 2>/dev/null | sed 's/^/  /'
sudo du -sh /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | awk '{ s += $1 } END { printf "  (colas: %d ficheros, tamaños arriba por federación)\n", NR }'
sudo du -sch /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | tail -1 | sed 's/^/  total de colas: /'
sudo du -sh /srv/data/backups 2>/dev/null | sed 's/^/  copias: /'
