#!/usr/bin/env bash
# Diagnostica por qué un recolector está levantado pero no dice nada.
#
#   bash scripts/servidor/diagnostica-arranque.sh                 # las 19 federaciones
#   bash scripts/servidor/diagnostica-arranque.sh murcia navarra  # sólo las que le pases
#
# Para cada federación muestra: estado del contenedor, cuándo arrancó, cuántas veces se ha
# reiniciado, cuántas líneas de registro tiene, si tiene perfil y configuración, y qué hay en
# su carpeta de cola. Es de sólo lectura: no toca nada.
set -uo pipefail

RAIZ=${FACYLF_RAIZ:-/srv/data/facylf}
COMPOSE_ENV="$RAIZ/docker/.env"

if [ "$#" -gt 0 ]; then
  FEDERACIONES=("$@")
else
  FEDERACIONES=(andalucia aragon asturias baleares canarias cantabria castilla-la-mancha \
    cataluna ceuta euskadi extremadura federacion galicia madrid melilla murcia navarra rioja valencia)
fi

for f in "${FEDERACIONES[@]}"; do
  c="facylf-$f-1"
  echo "══ $f ══"
  if ! docker inspect "$c" >/dev/null 2>&1; then
    echo "  no existe el contenedor $c"
    continue
  fi
  estado=$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null)
  arranque=$(docker inspect --format '{{.State.StartedAt}}' "$c" 2>/dev/null)
  reinicios=$(docker inspect --format '{{.RestartCount}}' "$c" 2>/dev/null)
  salida=$(docker inspect --format '{{.State.ExitCode}}' "$c" 2>/dev/null)
  orden=$(docker inspect --format '{{join .Config.Cmd " "}}' "$c" 2>/dev/null)
  lineas=$(docker logs "$c" 2>&1 | wc -l)
  echo "  estado=$estado arranque=$arranque reinicios=$reinicios salida=$salida lineas_de_registro=$lineas"
  echo "  orden=[$orden]"
  echo "  variables relevantes:"
  docker inspect --format '{{range .Config.Env}}{{println "    " .}}{{end}}' "$c" 2>/dev/null \
    | grep -Ei 'FACYLF_(EXCLUIR|TURNO|MEMORIA|RESERVA|CPUS|FEDERACION|PERFIL|COLA|MODO|SOLO)' || true
  echo "  perfil:    $( [ -f "$RAIZ/perfiles/$f.json" ] && echo sí || echo NO )"
  base=$(grep -E "^ *- *\\.\\./descargas-$f" "$RAIZ/docker/compose.yml" >/dev/null 2>&1 && echo sí || echo '?')
  echo "  montaje de cola declarado en compose.yml: $base"
  echo "  contenido de descargas-$f en el servidor:"
  du -sh "$RAIZ/descargas-$f" 2>/dev/null | sed 's/^/    /' || echo "    (no existe la carpeta)"
  ls -la "$RAIZ/descargas-$f" 2>/dev/null | head -6 | sed 's/^/    /'
  echo "  últimas 8 líneas de registro:"
  docker logs --tail 8 "$c" 2>&1 | sed 's/^/    /'
  echo
done

echo "── variables de despliegue ──"
grep -E '^(FACYLF_|COMPOSE_)' "$COMPOSE_ENV" 2>/dev/null | sed 's/^/  /' || echo "  (no se pudo leer $COMPOSE_ENV)"
