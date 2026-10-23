#!/bin/bash
# Medición correcta del consumo y del cuello de botella.
#
# POR QUÉ ESTE GUION EXISTE: el contenedor del monitor monta `/sys/fs/cgroup` DEL HOST (lo necesita para vigilar
# la rebanada `facylf.slice`), así que leer `/sys/fs/cgroup/cpu.stat` dentro de él devuelve el consumo de TODA la
# máquina, no el suyo. Con esa lectura el monitor «consumía» 788 % de un núcleo. Es un error de medición.
# La cuota sí está puesta: `cpu.max` de Cantabria es `68000 100000` (0,68 núcleo).
echo "=== VERSION DE CGROUPS ==="
stat -fc %T /sys/fs/cgroup
echo
echo "=== CPU POR CONTENEDOR SEGUN EL DAEMON (instantaneo) ==="
timeout 120 docker stats --no-stream --format '{{.Name}} {{.CPUPerc}} {{.MemUsage}}' 2>/dev/null | sort -t' ' -k2 -nr | head -20
echo
echo "=== COLA DE PROCESOS: ¿CPU O DISCO? (r=ejecutando, b=esperando E/S) ==="
vmstat 1 4 2>/dev/null | tail -5
echo
echo "=== CPU DEL HOST (mpstat, 3 muestras) ==="
if command -v mpstat >/dev/null 2>&1; then mpstat 1 3 2>/dev/null | tail -5; else echo "(sin mpstat)"; fi
echo
echo "=== CUOTAS DECLARADAS DE LOS QUE MAS CONSUMEN ==="
for c in facylf-castilla-la-mancha-1 facylf-andalucia-1 facylf-aragon-1 facylf-importador facylf-monitor; do
  echo -n "$c cpu.max="; docker exec "$c" sh -c 'cat /sys/fs/cgroup/cpu.max 2>/dev/null || echo "(no visible: monta el del host)"' 2>&1
done
