#!/usr/bin/env bash
# despliega-imagen-del-pc.sh — pone en el servidor la imagen de la web construida en el PC
#
# ── POR QUÉ ASÍ ─────────────────────────────────────────────────────────────────────────────────────────
#
# El servidor no puede compilar la web en un tiempo razonable: medido el 24/09/2026, `next build` allí consumía
# **0,5 s de CPU por cada 60 s** (0,8 % de un núcleo) porque compite con dieciséis recolectores y sus Chromium por
# cuatro núcleos. El PC tiene doce núcleos y tres recolectores ligeros, así que la imagen se construye allí y se
# trae hecha. No se pausa ningún recolector para acelerar nada: los invariantes del proyecto lo prohíben.
#
# ── LA COMPROBACIÓN QUE IMPORTA ─────────────────────────────────────────────────────────────────────────
#
# Un `docker load` que «funciona» no prueba que haya llegado LA imagen correcta, y aquí eso importa: si se
# desplegara una imagen vieja, la web volvería a enseñar las tres federaciones y parecería que el filtro no
# funciona. Por eso se compara el IDENTIFICADOR completo con el que declaró la construcción en el PC, y si no
# coincide **no se despliega nada**.
#
# Uso:  bash scripts/servidor/despliega-imagen-del-pc.sh <id-esperado>
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

TAR=/srv/data/facylf-web.tar
ID_ESPERADO="${1:?falta el identificador esperado de la imagen}"
REGISTRO=/tmp/despliegue-imagen-pc.log
exec > "$REGISTRO" 2>&1

echo "══ cargando la imagen construida en el PC · $(date -Is) ══"
[ -f "$TAR" ] || { echo "  no existe $TAR"; exit 1; }
docker load -i "$TAR" 2>&1 | tail -3

ID=$(docker images facylf-web:local --no-trunc --format '{{.ID}}' 2>/dev/null)
echo
echo "  ID en el servidor: ${ID:-ninguno}"
echo "  ID esperado:       ${ID_ESPERADO}"
if [ "$ID" != "$ID_ESPERADO" ]; then
  echo
  echo "  NO COINCIDEN: no se despliega nada (mejor una web vieja que una web equivocada)."
  echo "  Si el servidor conserva su propia compilación a medias, puede haber pisado la etiqueta."
  exit 1
fi
echo "  coinciden: es la imagen construida para este cambio"

echo
echo "── recreando el contenedor de la web ──"
docker compose --env-file docker/.env -f docker/web.yml up -d 2>&1 | tail -5

echo
echo "── esperando a que la web responda ──"
for intento in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 10 http://100.117.58.93:3100/ 2>/dev/null; then
    echo "  responde tras ${intento} intento(s)"; break
  fi
  sleep 5
done

echo
echo "══ VERIFICACIÓN: las tres fuera y el control dentro ══"
bash scripts/servidor/verifica-web-ocultas.sh despues
echo
echo "══ fin · $(date -Is) ══"
