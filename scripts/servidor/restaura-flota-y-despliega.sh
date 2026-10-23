#!/usr/bin/env bash
# restaura-flota-y-despliega.sh — levanta la flota que se quedó parada al reiniciar el demonio y remata la web
#
# ── QUÉ PASÓ (medido el 24/09/2026, 15:04) ──────────────────────────────────────────────────────────────
#
# Para desatascar un `docker load` clavado 45 minutos hubo que reiniciar el demonio de Docker. Al volver, **quince
# recolectores y el monitor se quedaron en `Exited (0)`** en vez de arrancar solos, aunque llevan
# `restart: unless-stopped`. Volvieron sólo cinco contenedores (castilla-la-mancha, fin-de-semana, importador,
# postgres y web). La recolección del servidor es lo primero, así que esto se arregla antes que nada.
#
# ── POR QUÉ NO ARRANCA LAS TRES DEL PC ──────────────────────────────────────────────────────────────────
#
# `docker compose up -d` sin nombres levanta los servicios SIN perfil, y Valencia, Madrid y Cataluña llevan
# `profiles: ["recoge-en-pc"]` justo para que un arranque general no las levante. Así que este guion restaura las
# dieciséis y no puede volver a encender las tres por descuido: es la misma protección que se puso al traspasarlas.
#
# Y se COMPRUEBA al final, en vez de darlo por bueno: 16 en marcha, las tres paradas.
#
# Uso:  bash scripts/servidor/restaura-flota-y-despliega.sh [id-esperado-de-la-imagen-web]
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/restaura-flota.log
exec > "$REGISTRO" 2>&1

echo "══ 1. Levantando la flota del servidor · $(date -Is) ══"
docker compose --project-name facylf --env-file docker/.env \
  -f docker/compose.yml -f docker/compose-turnos.yml up -d 2>&1 | tail -8

echo
echo "── 2. Esperando a que arranquen ──"
sleep 60
en_marcha=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c '^facylf-')
echo "  contenedores facylf en marcha: ${en_marcha}"

echo
echo "── 3. Los 16 recolectores, uno a uno ──"
faltan=0
for f in andalucia aragon asturias baleares canarias cantabria castilla-la-mancha ceuta euskadi extremadura \
         federacion galicia melilla murcia navarra rioja; do
  estado=$(docker inspect "facylf-${f}-1" --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  [ "$estado" = "running" ] || { echo "  NO CORRE: ${f} (${estado})"; faltan=$((faltan + 1)); }
done
[ "$faltan" = "0" ] && echo "  los 16 en marcha" || echo "  ${faltan} sin arrancar"

echo
echo "── 4. Las tres del PC, que deben seguir PARADAS ──"
for f in valencia madrid cataluna; do
  printf '  %-10s %s\n' "$f" "$(docker inspect "facylf-${f}-1" --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')"
done

echo
echo "── 5. Servicios de apoyo ──"
for c in facylf-monitor facylf-importador facylf-postgres facylf-web facylf-fin-de-semana-1; do
  printf '  %-26s %s\n' "$c" "$(docker inspect "$c" --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')"
done

ID_ESPERADO="${1:-}"
if [ -z "$ID_ESPERADO" ]; then
  echo
  echo "(sin identificador de imagen: no se toca la web)"
  echo "══ fin · $(date -Is) ══"
  exit 0
fi

echo
echo "══ 6. Rematando el despliegue de la web ══"
# El contenedor viejo impide crear el nuevo con el mismo nombre (`Conflict ... already in use`). Se retira y se
# vuelve a levantar: la web está en su propio fichero de compose, así que esto no toca a los recolectores.
docker rm -f facylf-web >/dev/null 2>&1 && echo '  contenedor viejo retirado'
docker compose --env-file docker/.env -f docker/web.yml up -d 2>&1 | tail -4

echo
echo "── esperando a que responda ──"
for intento in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 10 http://100.117.58.93:3100/ 2>/dev/null; then
    echo "  responde tras ${intento} intento(s)"; break
  fi
  sleep 5
done

ID=$(docker images facylf-web:local --no-trunc --format '{{.ID}}' 2>/dev/null)
echo "  imagen de la web en marcha (ID en el servidor): ${ID:-ninguno}"
echo "  esperado:                                       ${ID_ESPERADO}"

echo
echo "══ 7. VERIFICACIÓN: las tres fuera y el control dentro ══"
bash scripts/servidor/verifica-web-ocultas.sh despues
echo
echo "══ fin · $(date -Is) ══"
