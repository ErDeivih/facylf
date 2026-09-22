#!/usr/bin/env bash
# ¿Se puede dar prioridad de E/S y hay disco de sobra? Mide el caudal de disco en un intervalo y comprueba las
# herramientas disponibles dentro de la imagen.
set -uo pipefail
SEGUNDOS=${1:-20}

echo "── herramientas de prioridad de E/S en la imagen ──"
docker run --rm --entrypoint sh facylf-recolectores:local -c 'command -v ionice || echo "no hay ionice"'
docker run --rm --entrypoint sh facylf-recolectores:local -c 'command -v nice || echo "no hay nice"'

echo
echo "── discos del sistema ──"
lsblk -d -o NAME,SIZE,ROTA,MODEL 2>/dev/null | sed 's/^/  /'

echo
echo "── caudal de disco en $SEGUNDOS s ──"
a=$(awk '$3 ~ /^(sd|nvme|vd)/ { r += $6; w += $10 } END { print r + 0, w + 0 }' /proc/diskstats)
sleep "$SEGUNDOS"
b=$(awk '$3 ~ /^(sd|nvme|vd)/ { r += $6; w += $10 } END { print r + 0, w + 0 }' /proc/diskstats)
awk -v a="$a" -v b="$b" -v s="$SEGUNDOS" 'BEGIN {
  split(a, x, " "); split(b, y, " ");
  printf "  lectura:   %7.2f MB/s\n", (y[1] - x[1]) * 512 / 1048576 / s;
  printf "  escritura: %7.2f MB/s\n", (y[2] - x[2]) * 512 / 1048576 / s;
}'

echo
echo "── quién escribe (E/S por contenedor, de `docker stats`) ──"
docker stats --no-stream --format '{{.Name}}|{{.BlockIO}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null | sort -t'|' -k2 -hr | head -8 | sed 's/|/  ·  /g; s/^/  /'
