#!/usr/bin/env bash
# arregla-red-de-la-web.sh — la web tiene que estar en la MISMA red de Docker que PostgreSQL
#
# ── QUÉ PASÓ (medido el 24/09/2026, 15:15) ───────────────────────────────────────────────────────────────
#
# Al desplegar la imagen nueva, la web se levantó así:
#
#     docker compose --env-file docker/.env -f docker/web.yml up -d
#
# **sin `--project-name facylf`**. Compose creó entonces su propia red (`docker_default`) y la web quedó en ella,
# mientras `facylf-postgres` vive en la red del proyecto de los recolectores. Consecuencia, medida en el HTML:
#
#     «No se pudo consultar el canónico: getaddrinfo ENOTFOUND facylf-postgres»
#
# La web no caía ni daba un error 500: enseñaba su panel honesto de «no se pudo leer», que es justo para lo que
# está. Las páginas bajaron de 54-259 KB a ~15 KB y el control de la verificación salió 0 — que es exactamente
# para lo que se puso el control: para que un cero no se confundiera con un éxito.
#
# La lección: al levantar un servicio hay que respetar el NOMBRE DE PROYECTO con el que se creó la pila. Cambiarlo
# no da error, cambia la red, y el fallo aparece más tarde y más lejos.
#
# SÓLO toca el contenedor de la web. No toca recolectores ni la base de datos.
#
# Uso:  bash scripts/servidor/arregla-red-de-la-web.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/arregla-red-web.log
exec > "$REGISTRO" 2>&1

echo "══ 1. ¿En qué red vive PostgreSQL? · $(date -Is) ══"
RED_PG=$(docker inspect facylf-postgres --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' 2>/dev/null | head -1)
echo "  facylf-postgres: ${RED_PG:-desconocida}"
echo "  facylf-web:      $(docker inspect facylf-web --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' 2>/dev/null | head -1)"

echo
echo "── 2. Recreando la web CON el nombre de proyecto de la pila ──"
docker rm -f facylf-web >/dev/null 2>&1 && echo '  contenedor retirado'
docker compose --project-name facylf --env-file docker/.env -f docker/web.yml up -d 2>&1 | tail -4

echo
echo "── 3. ¿Está ahora en la red correcta? ──"
sleep 10
red_web=$(docker inspect facylf-web --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' 2>/dev/null | head -1)
echo "  facylf-web ahora: ${red_web:-desconocida}"
if [ "$red_web" = "$RED_PG" ]; then echo "  coinciden: la web ve la base de datos"
else echo "  AVISO: siguen en redes distintas (${red_web} frente a ${RED_PG})"; fi

echo
echo "── 4. ¿Puede resolver la base de datos desde dentro? ──"
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
bash scripts/servidor/verifica-web-ocultas.sh despues
echo
echo "══ fin · $(date -Is) ══"
