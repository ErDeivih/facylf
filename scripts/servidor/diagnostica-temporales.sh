#!/bin/bash
# ── ¿ACUMULA TEMPORALES EL SERVIDOR? ────────────────────────────────────────────────────────────────────
#
# En el PC se encontraron **3.929 carpetas `scoped_dir*` de Selenium ocupando 101 GB** en `%TEMP%`, hasta
# dejar C: al 99 % — y con el disco lleno el navegador dejó de poder trabajar: las cuatro federaciones se
# quedaron sin recolectar y nadie lo relacionaba con el espacio.
#
# En el servidor el Chrome vive DENTRO de cada contenedor, así que sus temporales van al sistema de ficheros
# del contenedor, que está dentro del disco de Docker. Hay que medirlo antes de dar por hecho que no pasa:
# un contenedor que se recrea se lleva sus temporales, pero uno que lleva semanas en marcha los acumula.
#
# SÓLO LEE.
#
# Uso:  bash diagnostica-temporales.sh
set -u

echo "════════════════════════════════════════════════════════════════════════════════"
echo " 1 · CARGA Y NÚCLEOS (la saturación sostenida es la sospecha del apagón)"
echo "════════════════════════════════════════════════════════════════════════════════"
echo "  núcleos: $(nproc)   ·   $(uptime)"
free -h | head -2 | sed 's/^/  /'

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 2 · QUIÉN SE COME LA CPU (los 10 primeros)"
echo "════════════════════════════════════════════════════════════════════════════════"
timeout 45 docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null |
  sort -t'|' -k2 -rn | head -10 | awk -F'|' '{ printf "  %-26s CPU %-10s RAM %s\n", $1, $2, $3 }'

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 3 · TEMPORALES DE CHROME DENTRO DE CADA RECOLECTOR"
echo "════════════════════════════════════════════════════════════════════════════════"
printf '  %-26s %-14s %-12s %s\n' CONTENEDOR SCOPED_DIR TAM_TMP UPTIME
for c in $(docker ps --format '{{.Names}}' | grep '^facylf-' | grep -vE 'postgres|web|monitor|importador|fin-de-semana' | sort); do
  n=$(docker exec "$c" sh -c 'ls -d /tmp/scoped_dir* 2>/dev/null | wc -l' 2>/dev/null || echo '?')
  t=$(docker exec "$c" sh -c 'du -sh /tmp 2>/dev/null | cut -f1' 2>/dev/null || echo '?')
  up=$(docker inspect -f '{{.State.StartedAt}}' "$c" 2>/dev/null | cut -c1-16)
  printf '  %-26s %-14s %-12s %s\n' "$c" "$n" "$t" "$up"
done

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 4 · DISCO: HOST Y DOCKER"
echo "════════════════════════════════════════════════════════════════════════════════"
df -h / | tail -1 | sed 's/^/  /'
timeout 60 docker system df 2>/dev/null | sed 's/^/  /'

echo
echo "════════════════════════════════════════════════════════════════════════════════"
echo " 5 · PRESUPUESTO DE PLAZAS (es la palanca para bajar la carga)"
echo "════════════════════════════════════════════════════════════════════════════════"
memoria=$(grep -E '^FACYLF_MEMORIA_GB=' /srv/data/facylf/docker/.env 2>/dev/null | cut -d= -f2)
reserva=$(grep -E '^FACYLF_RESERVA_GB=' /srv/data/facylf/docker/.env 2>/dev/null | cut -d= -f2)
echo "  FACYLF_MEMORIA_GB=${memoria:-no declarado}  ·  FACYLF_RESERVA_GB=${reserva:-no declarado}"
awk -v m="${memoria:-10}" -v r="${reserva:-1.5}" 'BEGIN { printf "  → %d plazas de navegador\n", int((m - r) / 0.75) }'
echo "  (bajar una plaza libera ~0,75 GB de memoria y un navegador menos compitiendo por 4 núcleos)"
