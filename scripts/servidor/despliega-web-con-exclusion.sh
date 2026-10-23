#!/usr/bin/env bash
# despliega-web-con-exclusion.sh — recrea la web con el fichero de compose QUE LLEVA la exclusión
#
# ── QUÉ FALTABA (medido el 24/09/2026, 15:40) ────────────────────────────────────────────────────────────
#
# La web leía el canónico (el control daba 4 y 8 apariciones) pero **Valencia seguía apareciendo**. El código
# llevaba el filtro: se comprobó que la imagen contiene `FACYLF_EXCLUIR`. Lo que faltaba era la VARIABLE: el
# contenedor se creó con el `docker/web.yml` del SERVIDOR, que no la tenía, porque al escribirla en el PC **no se
# subió**. Con la lista vacía, el filtro no excluye nada y todo funciona… enseñando lo que no debe.
#
# Es un fallo silencioso por diseño —quitar la variable desactiva la exclusión sin dar ningún error—, así que se
# comprueba dos veces: que la variable está DENTRO del contenedor y que el resultado se ve en el HTML.
#
# ── EL NOMBRE DE PROYECTO, QUE YA ME MORDIÓ UNA VEZ ─────────────────────────────────────────────────────
#
# Se levanta con `--project-name facylf`, que es el de la pila donde vive PostgreSQL (`facylf_default`).
# Levantarla sin él la deja en otra red y la web no encuentra la base de datos (`getaddrinfo ENOTFOUND`).
#
# Uso:  bash scripts/servidor/despliega-web-con-exclusion.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/despliega-web-exclusion.log
exec > "$REGISTRO" 2>&1

echo "══ 1. El fichero de compose del servidor, ¿lleva la exclusión? · $(date -Is) ══"
grep -n 'FACYLF_EXCLUIR' docker/web.yml | sed 's/^/  /' || echo '  NO LA LLEVA (hay que subir el fichero del PC)'

echo
echo "── 2. Recreando la web con el proyecto de la pila ──"
docker rm -f facylf-web >/dev/null 2>&1 && echo '  contenedor retirado'
docker compose --project-name facylf --env-file docker/.env -f docker/web.yml up -d 2>&1 | tail -4

echo
echo "── 3. ¿Tiene la variable DENTRO el contenedor? ──"
for intento in $(seq 1 30); do
  estado=$(docker inspect facylf-web --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  [ "$estado" = "running" ] && break
  sleep 5
done
echo "  estado: ${estado}"
echo "  FACYLF_EXCLUIR: $(docker exec facylf-web printenv FACYLF_EXCLUIR 2>&1 || echo '(no definida: el filtro NO actúa)')"
echo "  red: $(docker inspect facylf-web --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)"

echo
echo "── 4. ¿Ve la base de datos? ──"
docker exec facylf-web sh -c 'getent hosts facylf-postgres || echo "  NO RESUELVE"' 2>&1 | sed 's/^/  /'

echo
echo "── esperando a que responda ──"
for intento in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 10 http://100.117.58.93:3100/ 2>/dev/null; then
    echo "  responde tras ${intento} intento(s)"; break
  fi
  sleep 5
done

echo
echo "══ 5. VERIFICACIÓN: las tres fuera y el control dentro ══"
bash scripts/servidor/verifica-web-ocultas.sh excluyendo
echo
echo "══ fin · $(date -Is) ══"
