#!/bin/bash
# Para las cinco federaciones nuevas: la carga del servidor esta en 39 sobre 4 nucleos y ellas acaban de
# arrancar haciendo su descubrimiento completo. La memoria esta bien (9 GB disponibles), asi que lo que se
# satura es CPU/disco. El usuario y Claude pidieron esperar a que el servidor aguante varios dias seguidos
# antes de sumar cinco navegadores mas, y el limite de memoria lleva menos de un dia funcionando.
#
# Parar NO borra nada: las colas y los catalogos siguen en su carpeta, y volver a arrancarlas es un
# `docker compose ... up -d <fed>`.
set -u
for f in bizkaia gipuzkoa araba laspalmas tenerife; do
  if docker stop "facylf-${f}-1" >/dev/null 2>&1; then echo "  parado ${f}"; else echo "  ${f}: no se pudo parar"; fi
done
echo
echo "=== espero 90 s y mido ==="
sleep 90
uptime
echo "=== los que mas CPU consumen ==="
timeout 40 docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}' 2>/dev/null | sort -t'|' -k2 -rn | head -6 | awk -F'|' '{printf "  %-26s CPU %-9s RAM %s\n", $1, $2, $3}'
echo "=== contenedores facylf arriba ==="
docker ps --format '{{.Names}}' | grep -c '^facylf'
