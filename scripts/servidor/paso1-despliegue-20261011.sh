#!/bin/bash
# ── PASO 1 del encargo del 11/10/2026: desplegar en el servidor ────────────────────────────────────────────
#
# Ejecuta SÓLO la parte del servidor del paso 1, en el orden del encargo. Cada paso comprueba antes de seguir,
# y si algo no cuadra se para en vez de continuar a ciegas.
#
# Lo que hace:
#   1. guarda la lista de temporadas asignadas de CyL y pone la nueva (con 2014-15 y 2012-13);
#   2. revisa docker/.env (suelo 2010-11 y Andalucía fuera);
#   3. recrea el monitor (necesita recrearse para ver las variables nuevas);
#   4. mira si los perfiles de Chrome están en el SSD, y según eso recrea o sólo reinicia los contenedores.
#
# NO toca nada del PC.
set -u
cd /srv/data/facylf || { echo "  *** no existe /srv/data/facylf"; exit 1; }

echo "===== 1 · temporadas asignadas de CyL ====="
D=descargas-federacion/recolector-local
if [ ! -f "$D/temporadas-asignadas.txt" ]; then echo "  *** falta $D/temporadas-asignadas.txt"; exit 1; fi
cp -v "$D/temporadas-asignadas.txt" "$D/temporadas-asignadas.txt.antes-20261011"
cp -v /tmp/ta.txt "$D/temporadas-asignadas.txt"
echo "  --- contenido nuevo ---"
cat "$D/temporadas-asignadas.txt" | sed 's/^/    /'

echo "===== 2 · docker/.env ====="
grep -E 'TEMPORADA_MINIMA|EXCLUIR' docker/.env | sed 's/^/    /' || echo "    (no define ninguna de las dos)"
if grep -q '^FACYLF_EXCLUIR=' docker/.env; then
  if ! grep -q 'andalucia' <(grep '^FACYLF_EXCLUIR=' docker/.env); then
    cp -v docker/.env docker/.env.antes-20261011
    sed -i 's/^\(FACYLF_EXCLUIR=.*\)$/\1,andalucia/' docker/.env
    echo "    añadida andalucia a EXCLUIR:"
    grep '^FACYLF_EXCLUIR=' docker/.env | sed 's/^/      /'
  else
    echo "    andalucia ya estaba en EXCLUIR ✓"
  fi
else
  echo "    .env no define EXCLUIR: valen los valores por defecto de compose.yml"
fi

echo "===== 3 · recrear el monitor ====="
bash scripts/servidor/recrea-monitor.sh 2>&1 | tail -4 | sed 's/^/    /'

echo "===== 4 · ¿perfiles de Chrome en el SSD? ====="
PERF=$(docker exec facylf-galicia-1 printenv FACYLF_DIR_PERFILES_CHROME 2>/dev/null)
echo "    FACYLF_DIR_PERFILES_CHROME = '${PERF}'"

C="docker compose --project-name facylf --env-file docker/.env -f docker/compose.yml -f docker/compose-turnos.yml"
F="aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura federacion galicia melilla murcia navarra rioja"

if [ -z "$PERF" ]; then
  echo "    -> vacío: hay que RECREAR los 15 para aplicar los perfiles en SSD y el código"
  $C up -d --no-deps $F 2>&1 | tail -20 | sed 's/^/    /'
else
  echo "    -> con valor: basta REINICIAR para que cojan el código"
  $C restart $F 2>&1 | tail -20 | sed 's/^/    /'
fi

echo "===== 5 · estado ====="
sleep 20
echo -n "    contenedores vivos: "; docker ps --format '{{.Names}}' | grep -c '^facylf'
echo -n "    andalucia en el servidor: "; docker inspect -f '{{.State.Status}}' facylf-andalucia-1 2>/dev/null || echo ausente
