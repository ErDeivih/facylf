#!/usr/bin/env bash
# Encuentra el `vigilante.sh` que está lanzando `docker stats` en bucle y las tareas programadas que lo llaman.
#
# Contexto: el 23/09/2026 la carga llegó a 227 sobre 4 núcleos con **65 procesos `docker stats --no-stream` a la
# vez**. `docker stats` tarda segundos en contestar; si algo lo llama cada pocos segundos, los procesos se apilan
# y se comen la máquina — sin recolectar una página más. Hay que encontrar al PADRE, no matar a los hijos.
#
# SÓLO LEE.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}

echo '── ¿existe el guion? ──'
for candidato in /estado/vigilante.sh "$RAIZ/estado/vigilante.sh" /srv/data/facylf/estado/vigilante.sh; do
  if [ -f "$candidato" ]; then
    echo "  SÍ: $candidato"
    echo "  ── contenido ──"
    cat "$candidato" | sed 's/^/    /'
  else
    echo "  no: $candidato"
  fi
done
echo

echo '── tareas programadas del usuario ──'
crontab -l 2>/dev/null | sed 's/^/  /' || echo '  (sin crontab para este usuario)'
echo
echo '── tareas programadas de root (si se puede) ──'
sudo crontab -l 2>/dev/null | sed 's/^/  /' || echo '  (sin acceso o sin crontab)'
echo
echo '── y las de /etc/cron.d y /etc/crontab ──'
grep -H -v '^#' /etc/crontab /etc/cron.d/* 2>/dev/null | grep -v '^$' | sed 's/^/  /' || echo '  (nada)'
echo

echo '── procesos vigilante vivos ──'
pgrep -af 'vigilante' 2>/dev/null | grep -v pgrep | head -8 | sed 's/^/  /' || echo '  ninguno'
echo
echo '── cuántos docker stats hay AHORA ──'
pgrep -c -f 'docker stats' 2>/dev/null || echo '  0'
echo "  carga: $(cut -d' ' -f1-3 /proc/loadavg)"
