#!/bin/bash
# ¿Dónde están las colas y qué disco las atiende? El cuello medido es E/S (23-28 procesos bloqueados, 17-22 %
# de iowait), así que lo que importa es qué dispositivo sirve a cada ruta y si es mecánico o SSD.
echo "=== DISCOS (rota=1 es mecánico, rota=0 es SSD) ==="
lsblk -d -o NAME,ROTA,SIZE,MODEL 2>/dev/null
echo
echo "=== MONTAJES ==="
df -h /srv/data /srv/ssd /var/lib/docker 2>/dev/null | sed 's/  */ /g'
echo
echo "=== ¿QUE DISPOSITIVO SIRVE A CADA RUTA? ==="
for r in /srv/data/facylf /srv/ssd/facylf /var/lib/docker; do
  d=$(df --output=source "$r" 2>/dev/null | tail -1)
  echo "$r -> $d"
done
echo
echo "=== COLAS: CUANTAS EN CADA SITIO Y DE QUE TAMAÑO ==="
echo -n "en /srv/data (¿mecanico?): "; ls -d /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | grep -v -- '-prueba' | wc -l
du -sch /srv/data/facylf/descargas-*/recolector-local/cola-v2.sqlite 2>/dev/null | tail -1
echo -n "en /srv/ssd (SSD):        "; ls -d /srv/ssd/facylf/*/cola-v2.sqlite 2>/dev/null | wc -l
du -sch /srv/ssd/facylf/*/cola-v2.sqlite 2>/dev/null | tail -1
echo
echo "=== E/S POR DISPOSITIVO (dos muestras de 10 s) ==="
leer_discos() {
  awk '$3 ~ /^(sd|nvme|vd|md)/ { print $3, $6, $10 }' /proc/diskstats
}
leer_discos > /tmp/d1.txt
sleep 10
leer_discos > /tmp/d2.txt
join /tmp/d1.txt /tmp/d2.txt 2>/dev/null | awk '{ lect=($5-$2)*512/10/1048576; escr=($6-$3)*512/10/1048576; printf "%-10s lectura %7.2f MB/s   escritura %7.2f MB/s\n", $1, lect, escr }'
echo
echo "=== PROCESOS EN ESPERA DE E/S (estado D) ==="
ps -eo stat,comm,args 2>/dev/null | awk '$1 ~ /^D/ {print $2}' | sort | uniq -c | sort -rn | head -10
echo
echo "=== CRON DEL HOST (quien escribe en estado/) ==="
crontab -l 2>/dev/null | grep -v '^#' | head -8
