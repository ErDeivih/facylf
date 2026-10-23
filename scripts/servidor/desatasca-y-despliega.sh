#!/usr/bin/env bash
# desatasca-y-despliega.sh — reinicia el demonio de Docker, carga la imagen del PC y despliega la web
#
# ── POR QUÉ HACE FALTA REINICIAR EL DEMONIO ──────────────────────────────────────────────────────────────
#
# Medido el 24/09/2026: un `docker load` de un tar de 128 MB se quedó clavado **45 minutos** (proceso en estado
# `Sl`, sin escribir nada), con el tar íntegro a los dos lados. Primero apareció la causa evidente —dos cargas
# simultáneas del mismo tar, una de ellas de una orden que se me había agotado por tiempo y seguía viva—, se mató
# la duplicada y **aun así la que quedaba siguió clavada**. Eso ya no es contención de fichero: es el demonio
# atascado, y la forma de desatascarlo es reiniciarlo.
#
# ── POR QUÉ ES SEGURO ────────────────────────────────────────────────────────────────────────────────────
#
# Los servicios del proyecto llevan `restart: unless-stopped`, así que al volver el demonio se levantan solos los
# que estaban en marcha (los 16 recolectores, monitor, importador, web y PostgreSQL) y **los tres que se pararon a
# propósito siguen parados**: `unless-stopped` respeta una parada manual. Este guion lo COMPRUEBA al final en vez
# de darlo por supuesto.
#
# Y es una acción de MANTENIMIENTO, no un cambio de ritmo: no se toca la configuración de ningún recolector ni se
# duplica ningún worker.
#
# Uso:  bash scripts/servidor/desatasca-y-despliega.sh <id-esperado-de-la-imagen>
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

ID_ESPERADO="${1:?falta el identificador esperado de la imagen}"
TAR=/srv/data/facylf-web.tar
REGISTRO=/tmp/desatasca.log
exec > "$REGISTRO" 2>&1

echo "══ 1. Matando la carga clavada y reiniciando el demonio · $(date -Is) ══"
# El patrón va DENTRO del fichero (regla del traspaso): en la línea de órdenes se mataría a sí mismo.
pkill -f 'docker load -i /srv/data/facylf-web.tar' 2>/dev/null && echo '  carga clavada terminada' || echo '  no había carga'
sleep 2
sudo systemctl restart docker
echo "  demonio reiniciado"

echo
echo "── 2. Esperando a que el demonio responda ──"
for intento in $(seq 1 60); do
  if docker info >/dev/null 2>&1; then echo "  responde tras ${intento} intento(s)"; break; fi
  sleep 5
done
docker info >/dev/null 2>&1 || { echo "  EL DEMONIO NO VUELVE: no se sigue."; exit 1; }

echo
echo "── 3. Contenedores que han vuelto ──"
sleep 20
en_marcha=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -c '^facylf-')
echo "  contenedores facylf en marcha: ${en_marcha}"
for f in valencia madrid cataluna; do
  printf '  %-10s %s (debe seguir parada)\n' "$f" "$(docker inspect "facylf-${f}-1" --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')"
done

echo
echo "══ 4. Cargando la imagen construida en el PC ══"
docker load -i "$TAR" 2>&1 | tail -3
ID=$(docker images facylf-web:local --no-trunc --format '{{.ID}}' 2>/dev/null)
echo "  ID en el servidor: ${ID:-ninguno}"
echo "  ID esperado:       ${ID_ESPERADO}"
if [ "$ID" != "$ID_ESPERADO" ]; then
  echo "  NO COINCIDEN: no se despliega nada."
  exit 1
fi
echo "  coinciden"

echo
echo "══ 5. Desplegando la web ══"
docker compose --env-file docker/.env -f docker/web.yml up -d 2>&1 | tail -5

echo
echo "── esperando a que responda ──"
for intento in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 10 http://100.117.58.93:3100/ 2>/dev/null; then
    echo "  responde tras ${intento} intento(s)"; break
  fi
  sleep 5
done

echo
echo "══ 6. VERIFICACIÓN: las tres fuera y el control dentro ══"
bash scripts/servidor/verifica-web-ocultas.sh despues
echo
echo "══ fin · $(date -Is) ══"
