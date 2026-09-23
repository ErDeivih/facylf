#!/usr/bin/env bash
# ── CORTA LA PILA DE `docker stats` Y EVITA QUE VUELVA A FORMARSE ────────────────────────────────────────
#
# ── QUÉ PASABA (medido el 23/09/2026) ───────────────────────────────────────────────────────────────────
#
# El `cron` de facylf lanzaba, cada minuto:
#
#     * * * * * cd /srv/data/facylf && docker stats --no-stream --format '…' > estado/contenedores.txt
#
# `docker stats --no-stream` con 20 contenedores vivos tarda SEGUNDOS cuando la máquina va cargada… y bajo carga
# puede tardar más de un minuto. Como no había ninguna protección, cada minuto arrancaba otro sin esperar al
# anterior: se llegaron a ver **65 procesos `docker stats` a la vez**. Y cada uno de esos procesos mira los
# cgroups de todos los contenedores, así que consume procesador de verdad.
#
# Es un bucle que se ALIMENTA SOLO: más carga → más tarda cada uno → más se apilan → más carga. La carga llegó a
# 227 sobre 4 núcleos, con 87 hilos de `containerd-shim` y 73 de `docker` ejecutando, y sólo 17 de Chrome. La
# flota estaba sana (todas las federaciones con código 0) y aun así no podía recolectar: le faltaba procesador.
#
# ── QUÉ HACE ESTE GUION ─────────────────────────────────────────────────────────────────────────────────
#
# 1. mata la pila acumulada (sólo procesos `docker stats`, nada más);
# 2. reescribe esa línea del `cron` con `flock -n` (si ya hay una corriendo, la nueva NO se lanza) y con
#    `timeout 45` (una ejecución atascada muere antes de que llegue la siguiente);
# 3. comprueba el resultado.
#
# El patrón de `pkill` va DENTRO del fichero a propósito: escrito en la línea de órdenes se mataría a sí mismo.
set -uo pipefail

echo '── 1. pila acumulada ──'
antes=$(pgrep -c -f 'docker stats' 2>/dev/null || echo 0)
echo "  procesos «docker stats» vivos: $antes"

# Se matan de uno en uno y sin tocar nada más. `-f` es necesario porque la orden lleva argumentos.
pkill -f 'docker stats --no-stream' 2>/dev/null && echo '  pila cortada' || echo '  no había nada que cortar'
sleep 3
despues=$(pgrep -c -f 'docker stats' 2>/dev/null || echo 0)
echo "  procesos «docker stats» vivos ahora: $despues"

echo
echo '── 2. proteger la línea del cron ──'
actual=$(crontab -l 2>/dev/null)
if ! printf '%s' "$actual" | grep -q 'docker stats'; then
  echo '  no hay línea de docker stats en el crontab; nada que cambiar'
  exit 0
fi
if printf '%s' "$actual" | grep -q 'flock.*docker stats'; then
  echo '  ya estaba protegida con flock; no se toca'
  exit 0
fi

# La línea nueva: `flock -n` sobre un cerrojo propio y `timeout 45` por si se atasca.
nueva='* * * * * cd /srv/data/facylf && flock -n /tmp/facylf-contenedores.lock timeout 45 docker stats --no-stream --format '"'"'{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.PIDs}}'"'"' > estado/contenedores.txt 2>/dev/null'

copia="/tmp/crontab-antes-de-flock.txt"
printf '%s\n' "$actual" > "$copia"
printf '%s\n' "$actual" | grep -v 'docker stats --no-stream' > /tmp/crontab-nuevo.txt
printf '%s\n' "$nueva" >> /tmp/crontab-nuevo.txt

if crontab /tmp/crontab-nuevo.txt; then
  echo "  crontab actualizado (copia del anterior en $copia)"
else
  echo '  ✗ no se pudo actualizar el crontab; se deja como estaba'
  crontab "$copia"
  exit 1
fi

echo
echo '── 3. comprobación ──'
crontab -l 2>/dev/null | grep -n 'docker stats' | sed 's/^/  /'
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
