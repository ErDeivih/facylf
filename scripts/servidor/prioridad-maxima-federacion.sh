#!/usr/bin/env bash
# prioridad-maxima-federacion.sh — Castilla y León por encima de todas en el servidor
#
# ── QUÉ HACE Y POR QUÉ ASÍ ──────────────────────────────────────────────────────────────────────────────
#
# El responsable quiere esta federación a MÁXIMA PRIORIDAD en las dos máquinas: es la que quiere tener
# completa cuanto antes. En el servidor eso se declara en `docker/compose-turnos.yml`, que reparte cuota de CPU y
# turno de plaza de navegador según el trabajo que le queda a cada federación.
#
# Medido el 24/09/2026, `federacion` estaba en 0,9 de CPU y 360 minutos de turno: entre las más altas (empatada
# con Cataluña, Andalucía y Asturias) pero NO por encima. Se le pone 1,40 y 600, que es el techo del reparto, y
# queda claramente primera.
#
# ── POR QUÉ NO SE REGENERA EL FICHERO ENTERO ────────────────────────────────────────────────────────────
#
# Porque `calcula-turnos.mjs` recalcularía las cuotas de LAS DIECINUEVE, y aplicar eso exigiría recrear
# diecinueve contenedores en un demonio de Docker que responde muy despacio (medido hoy: `docker ps` llegando a
# agotar cinco minutos). Se toca SÓLO la entrada de esta federación y se recrea SÓLO su contenedor, así que el
# fichero sigue coincidiendo con lo que tienen puesto los demás.
#
# Se usa `sed` sobre la entrada exacta y luego se COMPRUEBA lo escrito: un `sed` que no case no da error, deja el
# fichero igual y parecería que se ha aplicado.
#
# SÓLO toca el servicio `federacion`.
#
# Uso:  bash scripts/servidor/prioridad-maxima-federacion.sh
set -uo pipefail
cd /srv/data/facylf || exit 1
export LC_ALL=C

REGISTRO=/tmp/prioridad-federacion.log
exec > "$REGISTRO" 2>&1

FICHERO=docker/compose-turnos.yml
echo "══ 1. Antes · $(date -Is) ══"
grep -A3 '^  federacion:' "$FICHERO" | sed 's/^/  /'

# Copia de seguridad con fecha: el fichero está generado y conviene poder volver atrás.
cp "$FICHERO" "$FICHERO.antes-de-prioridad"

echo
echo "── 2. Subiendo turno y cuota de esta federación ──"
# Se actúa DENTRO del bloque de `federacion`: primero se localiza su número de línea y luego se cambian sólo las
# dos claves siguientes. Con un `sed` global se tocarían las de todas.
inicio=$(grep -n '^  federacion:' "$FICHERO" | cut -d: -f1)
if [ -z "$inicio" ]; then echo "  NO se encontró la entrada de federacion"; exit 1; fi
fin=$((inicio + 3))
sed -i "${inicio},${fin}s/FACYLF_TURNO_PLAZA_MIN: \"[0-9]*\"/FACYLF_TURNO_PLAZA_MIN: \"600\"/" "$FICHERO"
sed -i "${inicio},${fin}s/cpus: [0-9.]*/cpus: 1.4/" "$FICHERO"

echo
echo "── 3. Después (y comprobación de que se escribió) ──"
grep -A3 '^  federacion:' "$FICHERO" | sed 's/^/  /'
if ! grep -A3 '^  federacion:' "$FICHERO" | grep -q 'cpus: 1.4'; then
  echo "  ✗ EL CAMBIO NO SE APLICÓ: se restaura la copia y no se recrea nada"
  cp "$FICHERO.antes-de-prioridad" "$FICHERO"
  exit 1
fi
echo "  ✓ aplicado"

echo
echo "── 4. Recreando SÓLO el contenedor de esta federación ──"
docker compose --project-name facylf --env-file docker/.env \
  -f docker/compose.yml -f docker/compose-turnos.yml up -d federacion 2>&1 | tail -4

echo
echo "── 5. Cuota que tiene puesta el contenedor (debe ser 1400000000) ──"
for intento in $(seq 1 40); do
  estado=$(docker inspect facylf-federacion-1 --format '{{.State.Status}}' 2>/dev/null || echo 'no existe')
  [ "$estado" = "running" ] && break
  sleep 5
done
docker inspect facylf-federacion-1 --format '  estado={{.State.Status}} cpu_max_nanos={{.HostConfig.NanoCpus}}' 2>&1
docker exec facylf-federacion-1 printenv FACYLF_TURNO_PLAZA_MIN 2>&1 | sed 's/^/  turno de plaza: /'

echo
echo "── 6. ¿Sigue leyendo su temporada asignada? ──"
tail -3 descargas-federacion/recolector-local/worker-programado.log | sed 's/^/  /'

echo
echo "══ fin · $(date -Is) ══"
